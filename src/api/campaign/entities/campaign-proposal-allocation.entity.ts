import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';
import { CampaignProposal } from './campaign-proposal.entity';

@Entity('campaign_proposal_allocations')
export class CampaignProposalAllocation extends AbstractEntity {
  @Column({ name: 'proposal_id', length: 36 })
  proposalId: string;

  @ManyToOne(() => CampaignProposal, (p) => p.allocations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'proposal_id' })
  proposal: CampaignProposal;

  @Column({
    type: 'varchar',
    name: 'budget_ref',
    length: 64,
    nullable: true,
  })
  budgetRef?: string | null;

  @Column({ length: 200 })
  label: string;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  amount: number;
}
