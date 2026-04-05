import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { AbstractEntity } from '../../../common/entities/abstract.entity';
import { SplitBill } from './split-bill.entity';
import { ActivityActionType } from '../enums';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';

@Entity('split_bill_activities')
@Index(['splitBillId', 'createdAt'])
@Index(['actorId'])
@Index(['participantId'])
@Index(['actionType'])
export class SplitBillActivity extends AbstractEntity {
  @Index()
  @Column({ name: 'split_bill_id' })
  splitBillId: string;

  @ManyToOne(() => SplitBill, (bill) => bill.activities, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'split_bill_id' })
  splitBill: SplitBill;

  @Column({ type: 'varchar', nullable: true, name: 'actor_id' })
  actorId: string | null;

  @Column({ type: 'varchar', nullable: true, name: 'participant_id' })
  participantId: string | null;

  @Column({ type: 'varchar', name: 'action_type' })
  actionType: ActivityActionType;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    nullable: true,
    name: 'amount_before',
    transformer: new ColumnNumericTransformer(),
  })
  amountBefore: number | null;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    nullable: true,
    name: 'amount_after',
    transformer: new ColumnNumericTransformer(),
  })
  amountAfter: number | null;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    nullable: true,
    name: 'amount_difference',
    transformer: new ColumnNumericTransformer(),
  })
  amountDifference: number | null;

  @Column({ type: 'varchar', nullable: true, name: 'bill_status_at_time' })
  billStatusAtTime: string | null;

  @Column({ type: 'varchar', nullable: true, name: 'transaction_id' })
  transactionId: string | null;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any> | null;
}
