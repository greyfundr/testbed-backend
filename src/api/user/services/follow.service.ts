import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Follow, User, Block } from '../entities';
import { ProfileVisibility } from '../enums/user.enum';
import { NotificationService } from '../../notification/services/notification.service';

@Injectable()
export class FollowService {
  constructor(
    @InjectRepository(Follow)
    private readonly followRepository: Repository<Follow>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Block)
    private readonly blockRepository: Repository<Block>,
    private readonly notificationService: NotificationService,
  ) {}

  async followUser(followerId: string, followingId: string) {
    if (followerId === followingId) {
      throw new BadRequestException('You cannot follow yourself');
    }

    const targetUser = await this.userRepository.findOne({
      where: { id: followingId },
      relations: ['settings'],
    });

    if (!targetUser) {
      throw new NotFoundException('User to follow not found');
    }

    // Check if following a private profile
    if (
      targetUser.settings?.privacyControls?.profileVisibility !==
      ProfileVisibility.PUBLIC
    ) {
      throw new BadRequestException(
        'You can only follow users with public profiles',
      );
    }

    // Check if the follower is blocked by the target user
    const isBlocked = await this.blockRepository.findOne({
      where: { blockerId: followingId, blockedId: followerId },
    });
    if (isBlocked) {
      throw new BadRequestException('You are blocked by this user');
    }

    // Check if the target user is blocked by the follower
    const hasBlocked = await this.blockRepository.findOne({
      where: { blockerId: followerId, blockedId: followingId },
    });
    if (hasBlocked) {
      throw new BadRequestException(
        'You have blocked this user. Unblock them first to follow.',
      );
    }

    const existingFollow = await this.followRepository.findOne({
      where: { followerId, followingId },
    });

    if (existingFollow) {
      throw new BadRequestException('You are already following this user');
    }

    const follow = this.followRepository.create({ followerId, followingId });
    await this.followRepository.save(follow);

    // Notify the user
    const follower = await this.userRepository.findOne({
      where: { id: followerId },
    });
    const followerName = follower?.firstName
      ? `${follower.firstName} ${follower.lastName}`
      : 'Someone';

    await this.notificationService.notify(followingId, 'socialInteractions', {
      title: 'New Follower',
      message: `${followerName} started following you.`,
      type: 'NEW_FOLLOWER',
      metadata: { followerId, pushToken: targetUser.fcmToken },
    });

    return { success: true, message: 'Followed successfully' };
  }

  async unfollowUser(followerId: string, followingId: string) {
    const follow = await this.followRepository.findOne({
      where: { followerId, followingId },
    });

    if (!follow) {
      throw new NotFoundException('Follow record not found');
    }

    await this.followRepository.remove(follow);
    return { success: true, message: 'Unfollowed successfully' };
  }

  async getFollowers(userId: string) {
    return this.followRepository.find({
      where: { followingId: userId },
      relations: ['follower', 'follower.profile'],
    });
  }

  async getFollowing(userId: string) {
    return this.followRepository.find({
      where: { followerId: userId },
      relations: ['following', 'following.profile'],
    });
  }

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const follow = await this.followRepository.findOne({
      where: { followerId, followingId },
    });
    return !!follow;
  }
}
