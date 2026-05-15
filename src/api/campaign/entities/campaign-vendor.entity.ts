import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { Campaign } from './campaign.entity';
import { CampaignVendorKind } from '../enums/campaign.enum';

@Entity('campaign_vendors')
export class CampaignVendor extends AbstractEntity {
  @Column({ name: 'campaign_id', length: 36 })
  campaignId: string;

  @ManyToOne(() => Campaign, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_id' })
  campaign: Campaign;

  @Column({ length: 120 })
  name: string;

  @Column({
    type: 'enum',
    enum: CampaignVendorKind,
    default: CampaignVendorKind.VENDOR,
  })
  kind: CampaignVendorKind;

  @Column({
    type: 'varchar',
    name: 'bank_name',
    length: 120,
    nullable: true,
  })
  bankName?: string | null;

  @Column({
    type: 'varchar',
    name: 'account_name',
    length: 120,
    nullable: true,
  })
  accountName?: string | null;

  @Column({
    type: 'varchar',
    name: 'account_number',
    length: 32,
    nullable: true,
  })
  accountNumber?: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  contact?: string | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;
}
