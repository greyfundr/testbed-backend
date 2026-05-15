import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from '../../user/entities/user.entity';
import { Campaign } from './campaign.entity';

// Organiser broadcast posted on a campaign's Updates tab. Authored
// by the campaign creator or one of its organisers. Visible to every
// viewer of the campaign — there's no audience gating today.
@Entity('campaign_updates')
@Index('idx_campaign_updates_campaign_created', ['campaignId', 'createdAt'])
export class CampaignUpdate {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'campaign_id', length: 255 })
  campaignId: string;

  @ApiProperty({ description: 'User id of the organiser who posted' })
  @Column({ name: 'author_id', length: 255 })
  authorId: string;

  @ApiProperty({ description: 'Post body (plain text)' })
  @Column({ type: 'text' })
  body: string;

  @ApiPropertyOptional({ description: 'Pin to top of the timeline' })
  @Column({ type: 'tinyint', default: 0 })
  pinned: boolean;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Campaign, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_id' })
  campaign: Campaign;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'author_id' })
  author: User;
}
