import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FriendRequest } from '../entities/friend-request.entity';
import { User } from '../entities/user.entity';
import { Block } from '../entities/block.entity';
import { FriendRequestStatus } from '../enums/user.enum';
import {
  SendFriendRequestDto,
  UpdateFriendRequestDto,
} from '../dtos/friend-request.dto';
import { NotificationService } from '../../notification/services/notification.service';

@Injectable()
export class FriendRequestService {
  constructor(
    @InjectRepository(FriendRequest)
    private readonly friendRequestRepository: Repository<FriendRequest>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Block)
    private readonly blockRepository: Repository<Block>,
    private readonly notificationService: NotificationService,
  ) {}

  async sendRequest(senderId: string, dto: SendFriendRequestDto) {
    if (senderId === dto.receiverId) {
      throw new BadRequestException(
        'You cannot send a friend request to yourself',
      );
    }

    const receiver = await this.userRepository.findOne({
      where: { id: dto.receiverId },
    });
    if (!receiver) {
      throw new NotFoundException('Receiver not found');
    }

    // Check if either user has blocked the other
    const block = await this.blockRepository.findOne({
      where: [
        { blockerId: senderId, blockedId: dto.receiverId },
        { blockerId: dto.receiverId, blockedId: senderId },
      ],
    });

    if (block) {
      if (block.blockerId === senderId) {
        throw new BadRequestException('You have blocked this user');
      } else {
        throw new BadRequestException('You are blocked by this user');
      }
    }

    const existingRequest = await this.friendRequestRepository.findOne({
      where: [
        { senderId, receiverId: dto.receiverId },
        { senderId: dto.receiverId, receiverId: senderId },
      ],
    });

    if (existingRequest) {
      if (existingRequest.status === FriendRequestStatus.PENDING) {
        throw new BadRequestException(
          'A friend request already exists between these users',
        );
      }
      if (existingRequest.status === FriendRequestStatus.ACCEPTED) {
        throw new BadRequestException('You are already friends with this user');
      }
      // If REJECTED, we could allow resending by updating the status or we can delete and recreate
      if (existingRequest.status === FriendRequestStatus.REJECTED) {
        existingRequest.status = FriendRequestStatus.PENDING;
        existingRequest.senderId = senderId;
        existingRequest.receiverId = dto.receiverId;
        await this.friendRequestRepository.save(existingRequest);

        await this.notifyReceiver(receiver, senderId);
        return existingRequest;
      }
    }

    const newRequest = this.friendRequestRepository.create({
      senderId,
      receiverId: dto.receiverId,
      status: FriendRequestStatus.PENDING,
    });

    await this.friendRequestRepository.save(newRequest);

    await this.notifyReceiver(receiver, senderId);

    return newRequest;
  }

  private async notifyReceiver(receiver: User, senderId: string) {
    const sender = await this.userRepository.findOne({
      where: { id: senderId },
    });
    const senderName = sender?.firstName
      ? `${sender.firstName} ${sender.lastName}`
      : 'A user';

    await this.notificationService.notify(receiver.id, 'socialInteractions', {
      title: 'New Friend Request',
      message: `${senderName} sent you a friend request.`,
      type: 'FRIEND_REQUEST',
      metadata: { senderId, pushToken: receiver.fcmToken },
    });
  }

  async cancelRequest(senderId: string, requestId: string) {
    const request = await this.friendRequestRepository.findOne({
      where: { id: requestId, senderId },
    });
    if (!request) {
      throw new NotFoundException('Friend request not found');
    }

    if (request.status !== FriendRequestStatus.PENDING) {
      throw new BadRequestException('You can only cancel pending requests');
    }

    await this.friendRequestRepository.remove(request);
    return { success: true, message: 'Friend request cancelled successfully' };
  }

  async getPendingRequests(userId: string) {
    return this.friendRequestRepository.find({
      where: { receiverId: userId, status: FriendRequestStatus.PENDING },
      relations: ['sender', 'sender.profile'],
      order: { createdAt: 'DESC' },
    });
  }

  async updateRequestStatus(
    userId: string,
    requestId: string,
    dto: UpdateFriendRequestDto,
  ) {
    const request = await this.friendRequestRepository.findOne({
      where: { id: requestId, receiverId: userId },
      relations: ['sender', 'receiver'],
    });

    if (!request) {
      throw new NotFoundException('Friend request not found');
    }

    if (request.status !== FriendRequestStatus.PENDING) {
      throw new BadRequestException('Friend request is no longer pending');
    }

    request.status = dto.status;
    await this.friendRequestRepository.save(request);

    const action =
      dto.status === FriendRequestStatus.ACCEPTED ? 'accepted' : 'rejected';
    const receiverName = request.receiver?.firstName
      ? `${request.receiver.firstName} ${request.receiver.lastName}`
      : 'A user';

    await this.notificationService.notify(
      request.senderId,
      'socialInteractions',
      {
        title: `Friend Request ${dto.status === FriendRequestStatus.ACCEPTED ? 'Accepted' : 'Rejected'}`,
        message: `${receiverName} has ${action} your friend request.`,
        type: 'FRIEND_REQUEST_UPDATE',
        metadata: {
          receiverId: userId,
          status: dto.status,
          pushToken: request.sender?.fcmToken,
        },
      },
    );

    return request;
  }

  async getFriends(userId: string) {
    const requests = await this.friendRequestRepository.find({
      where: [
        { senderId: userId, status: FriendRequestStatus.ACCEPTED },
        { receiverId: userId, status: FriendRequestStatus.ACCEPTED },
      ],
      relations: ['sender', 'sender.profile', 'receiver', 'receiver.profile'],
      order: { updatedAt: 'DESC' },
    });

    return requests.map((req) => {
      const isSender = req.senderId === userId;
      const friend = isSender ? req.receiver : req.sender;
      return {
        requestId: req.id,
        connectedAt: req.updatedAt,
        friend,
      };
    });
  }

  async removeFriend(userId: string, friendId: string) {
    const request = await this.friendRequestRepository.findOne({
      where: [
        {
          senderId: userId,
          receiverId: friendId,
          status: FriendRequestStatus.ACCEPTED,
        },
        {
          senderId: friendId,
          receiverId: userId,
          status: FriendRequestStatus.ACCEPTED,
        },
      ],
    });

    if (!request) {
      throw new NotFoundException('Friend connection not found');
    }

    await this.friendRequestRepository.remove(request);
    return { success: true, message: 'Friend removed successfully' };
  }
}
