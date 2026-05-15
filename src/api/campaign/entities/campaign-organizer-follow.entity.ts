import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { User } from '../../user/entities';
import { CampaignOrganizer } from './campaign-organizer.entity';

@Entity('campaign_organizer_follows')
export class CampaignOrganizerFollow extends AbstractEntity {
  @Column({ name: 'organizer_id', length: 36 })
  organizerId: string;

  @ManyToOne(() => CampaignOrganizer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizer_id' })
  organizer: CampaignOrganizer;

  @Column({ name: 'user_id', length: 36 })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
