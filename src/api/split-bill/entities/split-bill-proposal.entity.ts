import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';
import { SplitBill } from './split-bill.entity';
import { SplitBillVendor } from './split-bill-vendor.entity';
import { User } from '../../user/entities';
import { SplitBillProposalStatus } from '../enums/split-bill.enum';
import { SplitBillProposalVote } from './split-bill-proposal-vote.entity';

// Proposed disbursement on a split bill — anyone (creator or
// participant) can propose; every participant gets to vote; the
// proposal is approved when `votesFor >= requiredApprovals` and
// rejected when `votesAgainst > (totalParticipants - requiredApprovals)`.
@Entity('split_bill_proposals')
export class SplitBillProposal extends AbstractEntity {
  @Column({ name: 'split_bill_id', length: 36 })
  splitBillId: string;

  @ManyToOne(() => SplitBill, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'split_bill_id' })
  splitBill: SplitBill;

  @Column({ name: 'proposer_id', length: 36 })
  proposerId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'proposer_id' })
  proposer: User;

  @Column({ length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  purpose?: string | null;

  @Column({
    type: 'varchar',
    name: 'vendor_id',
    length: 36,
    nullable: true,
  })
  vendorId?: string | null;

  @ManyToOne(() => SplitBillVendor, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'vendor_id' })
  vendor?: SplitBillVendor | null;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: 0,
    name: 'total_amount',
    transformer: new ColumnNumericTransformer(),
  })
  totalAmount: number;

  @Column({
    type: 'enum',
    enum: SplitBillProposalStatus,
    default: SplitBillProposalStatus.PENDING,
  })
  status: SplitBillProposalStatus;

  // Snapshot of the participant count when the proposal was created
  // so the approval threshold doesn't shift if participants are
  // added/removed mid-vote. Stored as an int.
  @Column({ type: 'int', name: 'required_approvals' })
  requiredApprovals: number;

  @Column({ type: 'int', default: 0, name: 'votes_for' })
  votesFor: number;

  @Column({ type: 'int', default: 0, name: 'votes_against' })
  votesAgainst: number;

  @Column({ type: 'timestamp', nullable: true, name: 'decided_at' })
  decidedAt?: Date | null;

  @OneToMany(() => SplitBillProposalVote, (v) => v.proposal)
  votes: SplitBillProposalVote[];
}
