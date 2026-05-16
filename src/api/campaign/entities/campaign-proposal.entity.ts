import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';
import { Campaign } from './campaign.entity';
import { CampaignVendor } from './campaign-vendor.entity';
import { User } from '../../user/entities';
import { ProposalStatus } from '../enums/campaign.enum';
import { CampaignProposalAllocation } from './campaign-proposal-allocation.entity';
import { CampaignProposalVote } from './campaign-proposal-vote.entity';

@Entity('campaign_proposals')
export class CampaignProposal extends AbstractEntity {
  @Column({ name: 'campaign_id', length: 36 })
  campaignId: string;

  @ManyToOne(() => Campaign, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_id' })
  campaign: Campaign;

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

  @ManyToOne(() => CampaignVendor, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'vendor_id' })
  vendor?: CampaignVendor | null;

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
    enum: ProposalStatus,
    default: ProposalStatus.PENDING,
  })
  status: ProposalStatus;

  @Column({ type: 'int', name: 'required_approvals' })
  requiredApprovals: number;

  @Column({ type: 'int', default: 0, name: 'votes_for' })
  votesFor: number;

  @Column({ type: 'int', default: 0, name: 'votes_against' })
  votesAgainst: number;

  @Column({ type: 'timestamp', nullable: true, name: 'decided_at' })
  decidedAt?: Date | null;

  @OneToMany(
    () => CampaignProposalAllocation,
    (a) => a.proposal,
    { cascade: true },
  )
  allocations: CampaignProposalAllocation[];

  @OneToMany(() => CampaignProposalVote, (v) => v.proposal)
  votes: CampaignProposalVote[];

  // ─── Random-donor approval flow ────────────────────────────────
  // The proposal is routed sequentially to up to three random top
  // donors. `pickedDonorIdsJson` is the initial pool, and the row
  // currently waiting on a decision is denormalised onto
  // `currentAssignmentId` + `assignmentExpiresAt` so the frontend
  // can render a countdown without joining.

  @Column({
    type: 'varchar',
    length: 36,
    nullable: true,
    name: 'current_assignment_id',
  })
  currentAssignmentId?: string | null;

  @Column({
    type: 'timestamp',
    precision: 6,
    nullable: true,
    name: 'assignment_expires_at',
  })
  assignmentExpiresAt?: Date | null;

  @Column({
    type: 'json',
    nullable: true,
    name: 'picked_donor_ids_json',
  })
  pickedDonorIds?: string[] | null;

  @Column({
    type: 'varchar',
    length: 64,
    nullable: true,
    name: 'rejection_reason',
  })
  rejectionReason?: string | null;
}
