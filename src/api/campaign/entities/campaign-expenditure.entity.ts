import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { User } from '../../user/entities';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';
import { Campaign } from './campaign.entity';

export interface ExpenditureReceipt {
  url: string;
  providerId?: string;
}

@Entity('campaign_expenditures')
export class CampaignExpenditure extends AbstractEntity {
  @Column({ name: 'campaign_id', length: 36 })
  campaignId: string;

  @ManyToOne(() => Campaign, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_id' })
  campaign: Campaign;

  @Column({ length: 255 })
  label: string;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  amount: number;

  @Column({
    type: 'varchar',
    name: 'budget_ref',
    length: 64,
    nullable: true,
  })
  budgetRef?: string | null;

  @Column({ type: 'json', nullable: true })
  receipts?: ExpenditureReceipt[] | null;

  @Column({ name: 'posted_by', length: 36 })
  postedBy: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'posted_by' })
  postedByUser: User;
}
