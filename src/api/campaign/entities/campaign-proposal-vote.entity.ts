import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { CampaignProposal } from './campaign-proposal.entity';
import { User } from '../../user/entities';
import { ProposalVoteValue } from '../enums/campaign.enum';

@Entity('campaign_proposal_votes')
@Index('UQ_proposal_voter', ['proposalId', 'voterId'], { unique: true })
export class CampaignProposalVote extends AbstractEntity {
  @Column({ name: 'proposal_id', length: 36 })
  proposalId: string;

  @ManyToOne(() => CampaignProposal, (p) => p.votes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'proposal_id' })
  proposal: CampaignProposal;

  @Column({ name: 'voter_id', length: 36 })
  voterId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'voter_id' })
  voter: User;

  @Column({ type: 'enum', enum: ProposalVoteValue })
  vote: ProposalVoteValue;
}
