import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { User } from '../../user/entities';
import { Wallet } from '../../wallet/entities/wallet.entity';
import { SplitBill } from './split-bill.entity';
import { ParticipantStatus, ParticipantRole } from '../enums/split-bill.enum';
import { ColumnNumericTransformer } from 'src/common/transformers/column-numeric.transformer';

@Entity('split_bill_participants')
@Index(['splitBillId', 'userId'], {
  unique: true,
  where: '"user_id" IS NOT NULL',
})
@Index(['splitBillId', 'guestPhone'], {
  unique: true,
  where: '"guest_phone" IS NOT NULL',
})
@Index(['splitBillId', 'status'])
@Index(['userId', 'status'])
export class SplitBillParticipant extends AbstractEntity {
  @Index()
  @Column({ name: 'split_bill_id' })
  splitBillId: string;

  @ManyToOne(() => SplitBill, (bill) => bill.participants, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'split_bill_id' })
  splitBill: SplitBill;

  @Index()
  @Column({ type: 'varchar', nullable: true, name: 'user_id' })
  userId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'guest_name' })
  guestName: string | null;

  @Index()
  @Column({ type: 'varchar', length: 20, nullable: true, name: 'guest_phone' })
  guestPhone: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'guest_email' })
  guestEmail: string | null;

  @Column({ type: 'varchar', default: ParticipantRole.PARTICIPANT })
  role: ParticipantRole;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: 0,
    name: 'amount_owed',
    transformer: new ColumnNumericTransformer(),
  })
  amountOwed: number;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: 0,
    name: 'amount_paid',
    transformer: new ColumnNumericTransformer(),
  })
  amountPaid: number;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: 0,
    name: 'amount_remaining',
    transformer: new ColumnNumericTransformer(),
  })
  amountRemaining: number;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: 0,
    name: 'balance_adjustment',
    transformer: new ColumnNumericTransformer(),
  })
  balanceAdjustment: number;

  /**
   * Whole-number percentage. Used when splitMethod = PERCENTAGE.
   * INT not FLOAT — no floating point in financial fields.
   */
  @Column({ type: 'int', nullable: true })
  percentage: number | null;

  // ── Status ────────────────────────────────────────────────────────────────

  @Column({ type: 'varchar', default: ParticipantStatus.INVITED })
  status: ParticipantStatus;

  /**
   * Number of times this user/phone has declined an invite to this
   * specific bill. Enforces the "2 strikes" rule: at 2 the creator
   * can no longer re-invite (or re-add) the same person on this bill.
   * Survives a soft-delete on the row — re-adding the same user does
   * NOT reset the counter, so a creator can't bypass the rule by
   * removing and re-adding.
   */
  @Column({ name: 'decline_count', type: 'int', unsigned: true, default: 0 })
  declineCount: number;

  // ── Invite / Access ───────────────────────────────────────────────────────

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 12, nullable: true, name: 'invite_code' })
  inviteCode: string | null;

  @Column({ type: 'timestamp', nullable: true, name: 'invite_expires_at' })
  inviteExpiresAt: Date | null;

  /**
   * Payment URL for guests — generated on demand, short-lived.
   * Guests use this to pay via Paystack without a GreyFundr account.
   */
  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    name: 'payment_link',
  })
  paymentLink: string | null;

  @Column({
    type: 'timestamp',
    nullable: true,
    name: 'payment_link_expires_at',
  })
  paymentLinkExpiresAt: Date | null;

  // ── Wallet Link ───────────────────────────────────────────────────────────

  /**
   * The wallet used to pay. Null for guests (they pay via payment link).
   * This plus sourceRef on Transaction is the complete payment audit trail.
   */
  @Column({ type: 'varchar', nullable: true, name: 'wallet_id' })
  walletId: string | null;

  @ManyToOne(() => Wallet, { nullable: true })
  @JoinColumn({ name: 'wallet_id' })
  wallet: Wallet | null;

  /**
   * How this participant paid. Populated on first payment.
   */
  @Column({ type: 'varchar', nullable: true, name: 'payment_method' })
  paymentMethod: 'wallet' | 'card' | 'bank_transfer' | null;

  // ── Lifecycle Timestamps ──────────────────────────────────────────────────

  @Column({ type: 'timestamp', nullable: true, name: 'invited_at' })
  invitedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true, name: 'accepted_at' })
  acceptedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true, name: 'declined_at' })
  declinedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true, name: 'first_paid_at' })
  firstPaidAt: Date | null;

  @Column({ type: 'timestamp', nullable: true, name: 'fully_paid_at' })
  fullyPaidAt: Date | null;

  // ── Reminders ────────────────────────────────────────────────────────────

  @Column({ type: 'int', default: 0, name: 'reminder_count' })
  reminderCount: number;

  @Column({ type: 'timestamp', nullable: true, name: 'last_reminded_at' })
  lastRemindedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  // ── Computed getters ──────────────────────────────────────────────────────

  get isGuest(): boolean {
    return this.userId === null;
  }

  get effectiveAmountOwed(): number {
    return this.amountOwed + this.balanceAdjustment;
  }

  get isFullyPaid(): boolean {
    // ₦1 tolerance for FP-rounding dust (₦10,000 / 3 = 3,333.33…).
    // Matches the write-path tolerance in split-bill.service.ts so
    // every code path agrees on what "settled" means.
    return this.effectiveAmountOwed - this.amountPaid < 1;
  }
}
