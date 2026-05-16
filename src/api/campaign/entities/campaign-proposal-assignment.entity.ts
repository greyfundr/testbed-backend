import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { CampaignProposal } from './campaign-proposal.entity';
import { User } from '../../user/entities';

export enum ProposalAssignmentDecision {
  PENDING = 'pending',
  APPROVE = 'approve',
  REJECT = 'reject',
  TIMEOUT = 'timeout',
}

// One row per donor pick on a disbursement proposal. The proposal is
// routed sequentially: assignment #0 is created first with a 2-minute
// `expiresAt`. When the assignee decides (or the sweeper marks the row
// TIMEOUT) the next assignment is created from `proposal.pickedDonorIds`.
//
// The first to reach two matching `APPROVE` or two matching `REJECT`
// decisions settles the proposal; if the picked pool is exhausted
// without consensus, the proposal is REJECTED with reason `no_quorum`.
@Entity('campaign_proposal_assignments')
export class CampaignProposalAssignment extends AbstractEntity {
  @Column({ name: 'proposal_id', length: 36 })
  proposalId: string;

  @ManyToOne(() => CampaignProposal, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'proposal_id' })
  proposal: CampaignProposal;

  @Column({ name: 'donor_user_id', length: 36 })
  donorUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'donor_user_id' })
  donor: User;

  @Column({ type: 'int', default: 0, name: 'sort_index' })
  sortIndex: number;

  @Column({
    type: 'enum',
    enum: ProposalAssignmentDecision,
    default: ProposalAssignmentDecision.PENDING,
  })
  decision: ProposalAssignmentDecision;

  @Column({
    type: 'timestamp',
    precision: 6,
    name: 'assigned_at',
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  assignedAt: Date;

  @Column({ type: 'timestamp', precision: 6, name: 'expires_at' })
  expiresAt: Date;

  @Column({
    type: 'timestamp',
    precision: 6,
    nullable: true,
    name: 'decided_at',
  })
  decidedAt?: Date | null;
}
