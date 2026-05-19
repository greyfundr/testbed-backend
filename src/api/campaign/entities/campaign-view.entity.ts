import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { Campaign } from './campaign.entity';

// One row per "the donor opened this campaign's detail screen"
// beacon. Used as a weak interest signal (boosts the campaign's
// tags into the viewer's interest profile) and as the basis for the
// trending sub-score (views in the last 24h). dwellMs is optional —
// recorded on screen close so we can later upgrade weak views to
// medium-interest signals based on how long they actually read.
@Entity('campaign_views')
export class CampaignView {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'campaign_id', length: 36 })
  campaignId: string;

  @ManyToOne(() => Campaign, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_id' })
  campaign: Campaign;

  @Column({ name: 'user_id', length: 36, nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({ name: 'dwell_ms', type: 'int', nullable: true })
  dwellMs: number | null;

  @CreateDateColumn({ name: 'viewed_at' })
  viewedAt: Date;
}
