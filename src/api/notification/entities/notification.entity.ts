import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { User } from '../../user/entities';

@Entity('notifications')
export class Notification extends AbstractEntity {
  @ManyToOne(() => User, (user) => user.notifications, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  title: string;

  @Column('text')
  message: string;

  @Column({ nullable: true })
  type: string; // e.g., 'campaign', 'payment', 'security'

  @Column('json', { nullable: true })
  metadata: any; // Extra info, e.g., campaignId, transactionId

  @Column({ default: false })
  isRead: boolean;

  @Column({ nullable: true })
  readAt: Date;
}
