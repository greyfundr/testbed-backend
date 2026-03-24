import { AbstractEntity } from 'src/common/entities';
import { Entity, Column, OneToMany } from 'typeorm';
import { Campaign } from './campaign.entity';

@Entity('campaign_categories')
export class CampaignCategory extends AbstractEntity {
  @Column({ type: 'varchar', length: 100, unique: true })
  name: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  icon: string | null;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean;

  @OneToMany(() => Campaign, (campaign) => campaign.category)
  campaigns: Campaign[];
}
