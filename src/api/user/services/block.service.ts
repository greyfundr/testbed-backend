import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Block, User, Follow, FriendRequest } from '../entities';
import { DataSource } from 'typeorm';

@Injectable()
export class BlockService {
  constructor(
    @InjectRepository(Block)
    private readonly blockRepository: Repository<Block>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Follow)
    private readonly followRepository: Repository<Follow>,
    @InjectRepository(FriendRequest)
    private readonly friendRequestRepository: Repository<FriendRequest>,
    private readonly dataSource: DataSource,
  ) {}

  async blockUser(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) {
      throw new BadRequestException('You cannot block yourself');
    }

    const blockedUser = await this.userRepository.findOne({
      where: { id: blockedId },
    });
    if (!blockedUser) {
      throw new NotFoundException('User to block not found');
    }

    const existingBlock = await this.blockRepository.findOne({
      where: { blockerId, blockedId },
    });

    if (existingBlock) {
      throw new BadRequestException('You have already blocked this user');
    }

    return await this.dataSource.transaction(async (manager) => {
      const block = manager.create(Block, { blockerId, blockedId });
      await manager.save(block);

      // Remove any existing follow relationships between the two users
      await manager.delete(Follow, [
        { followerId: blockerId, followingId: blockedId },
        { followerId: blockedId, followingId: blockerId },
      ]);

      // Remove any friend requests/connections between the two users
      await manager.delete(FriendRequest, [
        { senderId: blockerId, receiverId: blockedId },
        { senderId: blockedId, receiverId: blockerId },
      ]);

      return { success: true, message: 'User blocked successfully' };
    });
  }

  async unblockUser(blockerId: string, blockedId: string) {
    const block = await this.blockRepository.findOne({
      where: { blockerId, blockedId },
    });

    if (!block) {
      throw new NotFoundException('Block record not found');
    }

    await this.blockRepository.remove(block);
    return { success: true, message: 'User unblocked successfully' };
  }

  async isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    const block = await this.blockRepository.findOne({
      where: { blockerId, blockedId },
    });
    return !!block;
  }

  async getBlockedUsers(userId: string) {
    return this.blockRepository.find({
      where: { blockerId: userId },
      relations: ['blocked', 'blocked.profile'],
    });
  }
}
