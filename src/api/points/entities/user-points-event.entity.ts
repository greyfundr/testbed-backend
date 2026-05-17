import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { User } from '../../user/entities';

// Append-only ledger. Totals are computed by summing `points` where
// `reversed_at IS NULL`. Refunds flip `reversed_at` instead of deleting
// so the audit trail stays intact and a re-credit later can be traced.
@Entity('user_points_events')
export class UserPointsEvent extends AbstractEntity {
  @Column({ name: 'user_id', length: 36 })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'action_code', length: 128 })
  actionCode: string;

  @Column({ type: 'int' })
  points: number;

  // Free-text category (`donation`, `split_bill`, `event`, ...) so the
  // breakdown endpoint can group sections without parsing actionCode.
  @Column({ length: 64 })
  section: string;

  @Column({ name: 'source_type', type: 'varchar', length: 64, nullable: true })
  sourceType?: string | null;

  @Column({ name: 'source_ref_id', type: 'varchar', length: 36, nullable: true })
  sourceRefId?: string | null;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, unknown> | null;

  @Column({
    name: 'reversed_at',
    type: 'timestamp',
    precision: 6,
    nullable: true,
  })
  reversedAt?: Date | null;

  @Column({
    name: 'reversal_reason',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  reversalReason?: string | null;
}
