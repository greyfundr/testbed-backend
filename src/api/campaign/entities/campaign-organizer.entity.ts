import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { User } from '../../user/entities';
import { Campaign } from './campaign.entity';

// Invitation lifecycle for organisers linked to a platform user.
// `pending`  — invite was sent; invitee hasn't responded yet.
// `accepted` — invitee accepted; row is visible in the public rail.
// `rejected` — invitee declined; row stays for audit but is hidden
//              from public surfaces. `rejectionReason` may be set.
//
// Free-form organiser rows (no linked userId) are auto-accepted on
// create — there's no one to notify, so the legacy behaviour is
// preserved.
export enum OrganizerInvitationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}

@Entity('campaign_organizers')
export class CampaignOrganizer extends AbstractEntity {
  @Column({ name: 'campaign_id', length: 36 })
  campaignId: string;

  @ManyToOne(() => Campaign, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_id' })
  campaign: Campaign;

  @Column({ type: 'varchar', name: 'user_id', length: 36, nullable: true })
  userId?: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user?: User | null;

  @Column({ name: 'display_name', length: 150 })
  displayName: string;

  @Column({ length: 200 })
  role: string;

  @Column({
    type: 'varchar',
    name: 'avatar_url',
    length: 500,
    nullable: true,
  })
  avatarUrl?: string | null;

  @Column({
    type: 'varchar',
    name: 'brand_color',
    length: 20,
    nullable: true,
  })
  brandColor?: string | null;

  @Column({ type: 'tinyint', default: 0 })
  verified: boolean = false;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number = 0;

  @Column({
    name: 'invitation_status',
    type: 'enum',
    enum: OrganizerInvitationStatus,
    default: OrganizerInvitationStatus.ACCEPTED,
  })
  invitationStatus: OrganizerInvitationStatus =
    OrganizerInvitationStatus.ACCEPTED;

  @Column({
    type: 'text',
    name: 'rejection_reason',
    nullable: true,
  })
  rejectionReason?: string | null;

  @Column({
    type: 'datetime',
    name: 'responded_at',
    nullable: true,
  })
  respondedAt?: Date | null;

  followersCount?: number;
  isFollowing?: boolean;
}
