import {
  Entity,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { AbstractEntity } from '../../../common/entities';
import { User } from '../../user/entities';
import {
  ApprovalThresholdMode,
  CampaignStatus,
} from '../enums/campaign.enum';
import { Donation } from './donation.entity';
import { CampaignCategory } from './campaign-category.entity';
import { CampaignLike } from './campaign-like.entity';
import { CampaignComment } from './campaign-comment.entity';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';

export interface CampaignOffer {
  type: 'auto' | 'manual';
  condition: string;
  reward: string;
}

export interface CampaignBudget {
  id?: string;
  item: string;
  cost: number;
  image: string;
  docs?: number;
  note?: string;
}

export interface CampaignImage {
  imageUrl: string;
  providerId: string;
}

export type CampaignStoryBlockType = 'lead' | 'p' | 'h' | 'quote';

export interface CampaignStoryBlock {
  type: CampaignStoryBlockType;
  text: string;
  by?: string;
}

export interface CampaignTier {
  id: string;
  tier: string;
  min: number;
  color?: string;
  icon?: string;
  perks: string[];
}

@Entity('campaigns')
export class Campaign extends AbstractEntity {
  @ApiProperty({
    description: 'Campaign title',
    example: 'Help Build a School',
  })
  @Column()
  title: string;

  @ApiProperty({
    description: 'Campaign description',
    example: 'A fundraiser to build a primary school in rural area.',
  })
  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'category_id' })
  categoryId: string;

  @ManyToOne(() => CampaignCategory)
  @JoinColumn({ name: 'category_id' })
  category: CampaignCategory;

  @Column({ type: 'json' })
  offers: CampaignOffer[] = [];

  @Column({ type: 'json' })
  budget: CampaignBudget[] = [];

  @Column({ name: 'share_slug', unique: true, length: 21 })
  shareSlug: string;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'share_link' })
  shareLink: string | null;

  @ApiProperty({ description: 'Fundraising target in Naira', example: 1000000 })
  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  target: number;

  @ApiProperty({
    description: 'Current amount raised in Naira',
    example: 250000,
  })
  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: 0,
    name: 'current_amount',
    transformer: new ColumnNumericTransformer(),
  })
  currentAmount: number;

  @ApiProperty({
    description: 'Campaign start date',
    example: '2024-01-01T00:00:00Z',
  })
  @Column({ type: 'timestamp', name: 'start_date' })
  startDate: Date;

  @ApiProperty({
    description: 'Campaign end date',
    example: '2024-12-31T23:59:59Z',
  })
  @Column({ type: 'timestamp', name: 'end_date' })
  endDate: Date;

  @Column({ type: 'json' })
  images: CampaignImage[] = [];

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
    name: 'fee_percentage',
  })
  feePercentage: number;

  @ApiProperty({ description: 'Campaign status', enum: CampaignStatus })
  @Column({
    type: 'enum',
    enum: CampaignStatus,
    default: CampaignStatus.ACTIVE,
  })
  status: CampaignStatus;

  @Column({ name: 'creator_id', length: 255 })
  creatorId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'creator_id' })
  creator: User;

  @ManyToMany(() => User)
  @JoinTable({
    name: 'campaign_participants',
    joinColumn: { name: 'campaign_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'user_id', referencedColumnName: 'id' },
  })
  participants: User[];

  donorsCount?: number;

  @OneToMany(() => Donation, (donation) => donation.campaign)
  donations: Donation[];

  @OneToMany(() => CampaignLike, (like) => like.campaign)
  likes: CampaignLike[];

  @OneToMany(() => CampaignComment, (comment) => comment.campaign)
  comments: CampaignComment[];

  @Column({ type: 'varchar', length: 120, nullable: true })
  location?: string | null;

  @Column({ type: 'tinyint', default: 0 })
  urgent: boolean = false;

  @Column({
    type: 'text',
    nullable: true,
    name: 'accountability_note',
  })
  accountabilityNote?: string | null;

  @Column({ type: 'json', nullable: true })
  story?: CampaignStoryBlock[] | null;

  @Column({ type: 'json', nullable: true })
  tiers?: CampaignTier[] | null;

  @Column({
    type: 'enum',
    enum: ApprovalThresholdMode,
    default: ApprovalThresholdMode.AUTO,
    name: 'approval_threshold_mode',
  })
  approvalThresholdMode: ApprovalThresholdMode;

  @Column({
    type: 'int',
    nullable: true,
    name: 'approval_threshold_count',
  })
  approvalThresholdCount?: number | null;
}
