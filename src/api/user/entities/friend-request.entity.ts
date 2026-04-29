import { Entity, Column, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { User } from './user.entity';
import { FriendRequestStatus } from '../enums/user.enum';

@Entity('friend_requests')
@Unique(['senderId', 'receiverId'])
export class FriendRequest extends AbstractEntity {
  @Column({ name: 'sender_id' })
  senderId: string;

  @Column({ name: 'receiver_id' })
  receiverId: string;

  @Column({
    type: 'enum',
    enum: FriendRequestStatus,
    default: FriendRequestStatus.PENDING,
  })
  status: FriendRequestStatus;

  @ManyToOne(() => User, (user) => user.sentFriendRequests, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'sender_id' })
  sender: User;

  @ManyToOne(() => User, (user) => user.receivedFriendRequests, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'receiver_id' })
  receiver: User;
}
