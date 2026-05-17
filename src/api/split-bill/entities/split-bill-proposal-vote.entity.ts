import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { SplitBillProposal } from './split-bill-proposal.entity';
import { User } from '../../user/entities';
import { SplitBillProposalVoteValue } from '../enums/split-bill.enum';

// Per-participant vote on a split-bill proposal. The unique index on
// (proposal_id, voter_id) guarantees one vote per participant per
// proposal — repeated votes update the existing row rather than
// stacking duplicates.
@Entity('split_bill_proposal_votes')
@Index('UQ_sb_proposal_voter', ['proposalId', 'voterId'], { unique: true })
export class SplitBillProposalVote extends AbstractEntity {
  @Column({ name: 'proposal_id', length: 36 })
  proposalId: string;

  @ManyToOne(() => SplitBillProposal, (p) => p.votes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'proposal_id' })
  proposal: SplitBillProposal;

  @Column({ name: 'voter_id', length: 36 })
  voterId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'voter_id' })
  voter: User;

  @Column({ type: 'enum', enum: SplitBillProposalVoteValue })
  vote: SplitBillProposalVoteValue;
}
