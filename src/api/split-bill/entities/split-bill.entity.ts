import {
  Entity,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { User } from '../../user/entities';
import { SplitBillParticipant } from './split-bill-participant.entity';
import { SplitBillActivity } from './split-bill-activity.entity';
import { SplitMethod, SplitBillStatus } from '../enums/split-bill.enum';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';
import { SplitBillComment } from './split-bill-comment.entity';

export interface SplitBillOffer {
  type: 'auto' | 'manual';
  condition: string;
  reward: string;
}

@Entity('split_bills')
@Index(['creatorId', 'status'])
@Index(['status', 'dueDate'])
@Index(['sourceBillType', 'sourceBillId'])
export class SplitBill extends AbstractEntity {
  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'image_url' })
  imageUrl: string | null;

  @Column({ type: 'json', nullable: true })
  receipts: string[] | null;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    name: 'total_amount',
    transformer: new ColumnNumericTransformer(),
  })
  totalAmount: number;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: 0,
    name: 'total_collected',
    transformer: new ColumnNumericTransformer(),
  })
  totalCollected: number;

  @Column({ type: 'varchar', length: 3, default: 'NGN' })
  currency: string;

  @Column({ type: 'varchar', name: 'split_method', default: SplitMethod.EVEN })
  splitMethod: SplitMethod;

  @Column({ default: false, name: 'is_finalized' })
  isFinalized: boolean;

  @Column({ type: 'timestamp', nullable: true, name: 'finalized_at' })
  finalizedAt: Date | null;

  @Column({ default: true, name: 'allow_partial_payment' })
  allowPartialPayment: boolean;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    nullable: true,
    name: 'min_payment_amount',
    transformer: new ColumnNumericTransformer(),
  })
  minPaymentAmount: number | null;

  @Column({ type: 'int', default: 0, name: 'total_participants' })
  totalParticipants: number;

  @Column({ type: 'int', default: 0, name: 'total_paid_participants' })
  totalPaidParticipants: number;

  @Column({ type: 'varchar', default: SplitBillStatus.DRAFT })
  status: SplitBillStatus;

  @Column({ type: 'timestamp', nullable: true, name: 'due_date' })
  dueDate: Date | null;

  @Column({ type: 'timestamp', nullable: true, name: 'cancelled_at' })
  cancelledAt: Date | null;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    name: 'cancellation_reason',
  })
  cancellationReason: string | null;

  @Column({ type: 'timestamp', nullable: true, name: 'disputed_at' })
  disputedAt: Date | null;

  @Column({ type: 'text', nullable: true, name: 'dispute_reason' })
  disputeReason: string | null;

  /**
   * The GreyFundr user who receives the settled funds.
   * Usually the creator. Null if settling to an external bank account directly.
   */
  @Column({ type: 'varchar', nullable: true, name: 'recipient_user_id' })
  recipientUserId: string | null;

  @Column({ type: 'varchar', nullable: true, name: 'source_bill_type' })
  sourceBillType: 'invoice' | 'campaign' | 'request' | 'manual' | null;

  @Column({ type: 'varchar', nullable: true, name: 'source_bill_id' })
  sourceBillId: string | null;

  @Column({ type: 'int', default: 0, name: 'reminder_sent_count' })
  reminderSentCount: number;

  @Column({ type: 'timestamp', nullable: true, name: 'last_reminder_at' })
  lastReminderAt: Date | null;

  @Column({ type: 'int', nullable: true, name: 'reminder_days_before' })
  reminderDaysBefore: number | null;

  @Index()
  @Column({ name: 'creator_id' })
  creatorId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'creator_id' })
  creator: User;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'share_link' })
  shareLink: string | null;

  @OneToMany(() => SplitBillParticipant, (p) => p.splitBill, { cascade: true })
  participants: SplitBillParticipant[];

  @OneToMany(() => SplitBillActivity, (a) => a.splitBill, { cascade: true })
  activities: SplitBillActivity[];

  @Column({ type: 'json', nullable: true })
  offers: SplitBillOffer[] | null;

  @OneToMany(() => SplitBillComment, (c) => c.splitBill)
  comments: SplitBillComment[];

  get remainingAmount(): number {
    return this.totalAmount - this.totalCollected;
  }

  get fundingPercentage(): number {
    if (this.totalAmount === 0) return 0;
    return Math.floor((this.totalCollected / this.totalAmount) * 100);
  }

  get isFullyFunded(): boolean {
    return this.totalCollected >= this.totalAmount;
  }
}
