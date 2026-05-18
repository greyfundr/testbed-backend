import { Column, Entity, Index } from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';

// Lifecycle:
//   PENDING — created by SplitBillService.cancelBill for a guest
//             refund; SMS + WhatsApp notification fires.
//   CLAIMED — user signed up with this phone (or verified it on an
//             existing account); the amount has been credited to
//             their wallet.
//   RETURNED — never claimed within `expires_at`; the daily cron
//             credits the original payer's wallet back and marks
//             RETURNED so funds aren't lost.
//   EXPIRED — manual admin action; rare.
export enum PendingPayoutStatus {
  PENDING = 'PENDING',
  CLAIMED = 'CLAIMED',
  RETURNED = 'RETURNED',
  EXPIRED = 'EXPIRED',
}

export enum PendingPayoutSource {
  SPLIT_BILL_CANCEL = 'SPLIT_BILL_CANCEL',
}

@Entity('pending_payouts')
@Index('idx_pending_payouts_phone', ['phone'])
@Index('idx_pending_payouts_status_expires', ['status', 'expiresAt'])
@Index('idx_pending_payouts_claimed_by', ['claimedByUserId'])
export class PendingPayout extends AbstractEntity {
  @Column({ length: 20 })
  phone: string;

  @Column({
    type: 'decimal',
    precision: 14,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  amount: number;

  @Column({ length: 8, default: 'NGN' })
  currency: string;

  @Column({
    type: 'enum',
    enum: PendingPayoutSource,
    default: PendingPayoutSource.SPLIT_BILL_CANCEL,
  })
  source: PendingPayoutSource;

  @Column({ name: 'source_bill_id', length: 36 })
  sourceBillId: string;

  // Explicit `type: 'varchar'` is required on every nullable string
  // column. TypeScript emits `Object` (not `String`) for the reflected
  // type of a `string | null` union, which makes TypeORM bail with
  // `DataTypeNotSupportedError: Data type "Object" ... is not supported
  // by "mysql"`. Setting `type` short-circuits the reflection lookup.
  @Column({
    name: 'source_participant_id',
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  sourceParticipantId: string | null;

  @Column({
    name: 'origin_payer_user_id',
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  originPayerUserId: string | null;

  @Column({
    name: 'bill_creator_user_id',
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  billCreatorUserId: string | null;

  @Column({
    type: 'enum',
    enum: PendingPayoutStatus,
    default: PendingPayoutStatus.PENDING,
  })
  status: PendingPayoutStatus;

  @Column({ name: 'expires_at', type: 'timestamp', precision: 6 })
  expiresAt: Date;

  @Column({
    name: 'claimed_at',
    type: 'timestamp',
    precision: 6,
    nullable: true,
  })
  claimedAt: Date | null;

  @Column({
    name: 'claimed_by_user_id',
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  claimedByUserId: string | null;

  @Column({
    name: 'returned_at',
    type: 'timestamp',
    precision: 6,
    nullable: true,
  })
  returnedAt: Date | null;

  @Column({
    name: 'notified_at',
    type: 'timestamp',
    precision: 6,
    nullable: true,
  })
  notifiedAt: Date | null;

  @Column({ name: 'notification_meta', type: 'json', nullable: true })
  notificationMeta: Record<string, unknown> | null;
}
