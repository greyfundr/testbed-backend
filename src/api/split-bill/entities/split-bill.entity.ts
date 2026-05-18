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
import {
  SplitMethod,
  SplitBillStatus,
  SplitBillRecurrenceFrequency,
} from '../enums/split-bill.enum';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';
import { SplitBillComment } from './split-bill-comment.entity';

export interface SplitBillOffer {
  type: 'auto' | 'manual';
  condition: string;
  reward: string;
}

// Mirrors the Campaign budget shape so the two modules stay
// uniform. Image is optional here because split bills are typically
// more ad-hoc than campaign budgets — required-image is overkill.
export interface SplitBillBudgetItem {
  id?: string;
  item: string;
  cost: number;
  image?: string | null;
  note?: string | null;
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

  // Multi-photo bill cover gallery. The first entry mirrors
  // `imageUrl` for legacy clients. Nullable so existing bills keep
  // working unchanged.
  @Column({ type: 'json', nullable: true, name: 'cover_images_json' })
  coverImages: string[] | null;

  @Column({ type: 'json', nullable: true })
  receipts: string[] | null;

  // Optional budget line items the creator declares. Propose
  // Disbursement allocates against these when present; otherwise it
  // falls back to a free-form total amount.
  @Column({
    type: 'json',
    nullable: true,
    name: 'budget_items_json',
  })
  budget: SplitBillBudgetItem[] | null;

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

  // Legacy boolean — kept for compatibility while clients migrate
  // to the richer `recurrenceFrequency` enum below. Writes from the
  // service now derive this from the enum (false when ONE_OFF).
  @Column({ default: false, name: 'is_recurring' })
  isRecurring: boolean;

  // Granular bill cadence picked by the creator. ONE_OFF means a
  // single-time bill; everything else means a recurring obligation
  // that will eventually auto-reset on the chosen interval.
  @Column({
    type: 'enum',
    enum: SplitBillRecurrenceFrequency,
    default: SplitBillRecurrenceFrequency.ONE_OFF,
    name: 'recurrence_frequency',
  })
  recurrenceFrequency: SplitBillRecurrenceFrequency;

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
