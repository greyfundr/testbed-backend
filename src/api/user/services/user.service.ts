import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UpdateUserDto, UpdateProfileDto, GetUsersFilterDto } from '../dtos';
import { User, Profile, Kyc, USER_SAFE_FIELDS } from '../entities';
import { UserRepository, ProfileRepository } from '../repository';
import { DataSource, MoreThan } from 'typeorm';
import { Campaign, Donation } from 'src/api/campaign/entities';
import { Settings } from 'src/api/settings';
import {
  SplitBill,
  SplitBillParticipant,
  SplitBillActivity,
} from 'src/api/split-bill/entities';
import { SplitBillStatus, ParticipantStatus } from 'src/api/split-bill/enums';
import { Wallet } from 'src/api/wallet/entities';
import { FriendRequest, Follow, Block } from '../entities';
import { FriendRequestStatus } from '../enums/user.enum';

@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly profileRepository: ProfileRepository,
    private readonly dataSource: DataSource,
  ) {}

  async findOneById(id: string) {
    return this.userRepository.findOne({
      where: { id },
      select: USER_SAFE_FIELDS,
    });
  }

  async getUserProfile(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['profile', 'kycs', 'wallet'],
      select: {
        ...USER_SAFE_FIELDS.reduce(
          (obj, field) => ({ ...obj, [field]: true }),
          {},
        ),
        pin: true,
        profile: true,
        kycs: true,
        wallet: {
          id: true,
          transactionPin: true,
          availableBalance: true,
          currency: true,
          status: true,
        },
      },
    });

    if (!user) return null;

    const followersCount = await this.dataSource.getRepository(Follow).count({
      where: { followingId: userId },
    });
    const followingCount = await this.dataSource.getRepository(Follow).count({
      where: { followerId: userId },
    });

    return {
      ...user,
      followersCount,
      followingCount,
    };
  }

  async getUsers(filterDto: GetUsersFilterDto, currentUserId?: string) {
    const { name, email, phoneNumber, username, accountType } = filterDto;

    const query = this.userRepository
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.email',
        'user.phoneNumber',
        'user.firstName',
        'user.lastName',
        'user.username',
        'user.accountType',
      ])
      .leftJoinAndSelect('user.profile', 'profile')
      .leftJoinAndSelect('user.kycs', 'kycs');

    if (email) {
      query.andWhere('user.email LIKE :email', { email: `%${email}%` });
    }

    if (phoneNumber) {
      query.andWhere('user.phoneNumber LIKE :phoneNumber', {
        phoneNumber: `%${phoneNumber}%`,
      });
    }

    if (username) {
      query.andWhere('user.username LIKE :username', {
        username: `%${username}%`,
      });
    }

    if (accountType) {
      query.andWhere('user.accountType = :accountType', { accountType });
    }

    if (name) {
      query.andWhere(
        '(user.firstName LIKE :name OR user.lastName LIKE :name)',
        { name: `%${name}%` },
      );
    }

    const users = await query.getMany();

    if (!currentUserId || users.length === 0) {
      return users;
    }

    const userIds = users.map((u) => u.id);
    const friendRequests = await this.dataSource
      .getRepository(FriendRequest)
      .find({
        where: [{ senderId: currentUserId }, { receiverId: currentUserId }],
      });

    const follows = await this.dataSource.getRepository(Follow).find({
      where: { followerId: currentUserId },
    });

    const blocked = await this.dataSource.getRepository(Block).find({
      where: { blockerId: currentUserId },
    });

    const blockedBy = await this.dataSource.getRepository(Block).find({
      where: { blockedId: currentUserId },
    });

    return users.map((u) => {
      if (u.id === currentUserId) return { ...u, connectionStatus: 'self' };

      const request = friendRequests.find(
        (req) =>
          (req.senderId === currentUserId && req.receiverId === u.id) ||
          (req.receiverId === currentUserId && req.senderId === u.id),
      );

      const isFollowing = follows.some((f) => f.followingId === u.id);
      const isBlocked = blocked.some((b) => b.blockedId === u.id);
      const isBlockedBy = blockedBy.some((b) => b.blockerId === u.id);

      let connectionStatus = 'none';
      if (request) {
        if (request.status === FriendRequestStatus.ACCEPTED) {
          connectionStatus = 'friends';
        } else if (request.status === FriendRequestStatus.PENDING) {
          connectionStatus =
            request.senderId === currentUserId
              ? 'request_sent'
              : 'request_received';
        }
      }

      return {
        ...u,
        connectionStatus,
        requestId: request?.id || null,
        isFollowing,
        isBlocked,
        isBlockedBy,
      };
    });
  }

  update(id: number, updateUserDto: UpdateUserDto) {
    return this.userRepository.update(id, updateUserDto);
  }

  remove(id: number) {
    return this.userRepository.remove(id);
  }

  async updateFcmToken(userId: string, fcmToken: string) {
    await this.userRepository.update(userId, { fcmToken });
    return { success: true };
  }

  async updateProfile(user: User, updateProfileDto: UpdateProfileDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Update User fields
      if (updateProfileDto.firstName)
        user.firstName = updateProfileDto.firstName;
      if (updateProfileDto.lastName) user.lastName = updateProfileDto.lastName;
      if (updateProfileDto.username) user.username = updateProfileDto.username;
      if (updateProfileDto.dateOfBirth)
        user.dateOfBirth = new Date(updateProfileDto.dateOfBirth);

      await queryRunner.manager.save(user);

      // Handle Profile fields
      let profile = await this.profileRepository.findOne({
        where: { user: { id: user.id } },
      });

      if (!profile) {
        profile = new Profile();
        profile.user = user;
      }

      const profileFields = [
        'bio',
        'country',
        'state',
        'city',
        'address',
        'interests',
        'image',
      ];

      for (const field of profileFields) {
        if (updateProfileDto[field] !== undefined) {
          profile[field] = updateProfileDto[field];
        }
      }

      await queryRunner.manager.save(profile);

      await queryRunner.commitTransaction();

      // Reload user with profile
      return this.userRepository.findOne({
        where: { id: user.id },
        relations: ['profile', 'kycs'],
      });
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async deleteAccount(userId: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['settings', 'profile', 'kycs'],
    });

    if (!user) throw new NotFoundException('User not found');

    // const activeWallet = await this.dataSource.getRepository(Wallet).findOne({
    //   where: { userId },
    // });
    // if (activeWallet) {
    //   throw new BadRequestException(
    //     'Please withdraw your wallet balance before deleting your account.',
    //   );
    // }

    const activeBills = await this.dataSource
      .getRepository(SplitBill)
      .createQueryBuilder('bill')
      .where('bill.creatorId = :userId', { userId })
      .andWhere('bill.status NOT IN (:...statuses)', {
        statuses: [SplitBillStatus.SETTLED, SplitBillStatus.CANCELLED],
      })
      .getCount();

    if (activeBills > 0) {
      throw new BadRequestException(
        `You have ${activeBills} active split bill(s). Please settle or cancel them before deleting your account.`,
      );
    }

    const unpaidParticipation = await this.dataSource
      .getRepository(SplitBillParticipant)
      .createQueryBuilder('p')
      .innerJoin('p.splitBill', 'bill')
      .where('p.userId = :userId', { userId })
      .andWhere('p.status NOT IN (:...statuses)', {
        statuses: [ParticipantStatus.PAID],
      })
      .andWhere('bill.status NOT IN (:...statuses)', {
        statuses: [SplitBillStatus.SETTLED, SplitBillStatus.CANCELLED],
      })
      .andWhere('p.amountOwed > 0')
      .getCount();

    if (unpaidParticipation > 0) {
      throw new BadRequestException(
        `You have ${unpaidParticipation} unpaid split bill(s). Please settle your dues before deleting your account.`,
      );
    }

    // ── Delete in dependency order inside a transaction ─────────────────────
    await this.dataSource.transaction(async (manager) => {
      // 1. Notifications — no FK dependencies
      // await manager.delete(Notification, { user: { id: userId } });

      // 2. Split bill activity logs where actor is this user
      await manager
        .createQueryBuilder()
        .delete()
        .from(SplitBillActivity)
        .where('actorId = :userId', { userId })
        .execute();

      // 3. Split bill participants — remove user from bills they joined
      //    Soft-delete so the bill's financial record stays intact
      await manager
        .createQueryBuilder()
        .softDelete()
        .from(SplitBillParticipant)
        .where('userId = :userId', { userId })
        .execute();

      // 4. Campaigns created by user — soft delete (financial history preserved)
      await manager
        .createQueryBuilder()
        .softDelete()
        .from(Campaign)
        .where('creatorId = :userId', { userId })
        .execute();

      // 5. Donations made by user — soft delete
      await manager
        .createQueryBuilder()
        .softDelete()
        .from(Donation)
        .where('donorId = :userId', { userId })
        .execute();

      // 6. Wallet — soft delete (transaction history stays via Transaction entity)
      await manager
        .createQueryBuilder()
        .softDelete()
        .from(Wallet)
        .where('userId = :userId', { userId })
        .execute();

      // 7. Settings, Profile, Kyc — cascade: true handles these when user is deleted
      //    but we explicitly delete to be safe with soft-delete
      if (user.settings) {
        await manager.softDelete(Settings, { user: { id: userId } });
      }
      if (user.profile) {
        await manager.softDelete(Profile, { user: { id: userId } });
      }
      if (user.kycs && user.kycs.length > 0) {
        await manager.softDelete(Kyc, { user: { id: userId } });
      }

      // 8. Finally soft-delete the user — anonymize PII first
      await manager.update(User, userId, {
        email: `deleted_${userId}@deleted.greyfundr.com`,
        phoneNumber: `deleted_${userId}`,
        firstName: 'Deleted',
        lastName: 'User',
        username: null,
        password: '',
        pin: null,
        refreshToken: null,
        fcmToken: null,
        passwordResetToken: null,
      });

      await manager.softDelete(User, { id: userId });
    });
  }
}
