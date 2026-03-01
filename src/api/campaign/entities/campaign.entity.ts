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
import { CampaignCategory, CampaignStatus } from '../enums/campaign.enum';
import { Donation } from './donation.entity';
import { BigIntAmountTransformer } from '../../../common/transformers/column-numeric.transformer';

export interface CampaignOffer {
  type: 'auto' | 'manual';
  condition: string;
  reward: string;
}

export interface CampaignImage {
  imageUrl: string;
  providerId: string;
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

  @ApiProperty({ description: 'Campaign category', enum: CampaignCategory })
  @Column({
    type: 'varchar',
  })
  category: CampaignCategory;

  @Column({ type: 'json' })
  offers: CampaignOffer[] = [];

  @ApiProperty({ description: 'Fundraising target in Naira', example: 1000000 })
  @Column({
    type: 'bigint',
    default: 0,
    transformer: new BigIntAmountTransformer(),
  })
  target: number;

  @ApiProperty({
    description: 'Current amount raised in Naira',
    example: 250000,
  })
  @Column({
    type: 'bigint',
    default: 0,
    name: 'current_amount',
    transformer: new BigIntAmountTransformer(),
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

  @OneToMany(() => Donation, (donation) => donation.campaign)
  donations: Donation[];
}
