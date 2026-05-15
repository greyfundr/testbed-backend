import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { User } from '../../user/entities';
import { Campaign } from './campaign.entity';

@Entity('campaign_amplifiers')
@Index('UQ_campaign_amplifier_campaign_user', ['campaignId', 'userId'], {
  unique: true,
})
export class CampaignAmplifier extends AbstractEntity {
  @Column({ name: 'campaign_id', length: 36 })
  campaignId: string;

  @ManyToOne(() => Campaign, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_id' })
  campaign: Campaign;

  @Column({ name: 'user_id', length: 36 })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Index('UQ_campaign_amplifier_code', { unique: true })
  @Column({ length: 20 })
  code: string;

  // Derived (not persisted) — populated by service queries
  influencedAmount?: number;
  referralCount?: number;
}
