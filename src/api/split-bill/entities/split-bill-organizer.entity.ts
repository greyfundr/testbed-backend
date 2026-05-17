import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { User } from '../../user/entities';
import { SplitBill } from './split-bill.entity';

// Invitation lifecycle — mirrors campaign organisers so the UX
// (pending → accepted / rejected) is identical on both surfaces.
//   pending  — invite was sent; invitee hasn't responded.
//   accepted — invitee accepted; row visible in the public rail.
//   rejected — invitee declined; kept for audit, hidden from public.
//
// Free-form rows (no userId — name-only) auto-accept on create since
// there's no-one to notify and no inbox to wait on.
export enum SplitBillOrganizerInvitationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}

@Entity('split_bill_organizers')
@Index('idx_split_bill_organizers_bill', ['splitBillId'])
@Index('idx_split_bill_organizers_user_status', ['userId', 'invitationStatus'])
export class SplitBillOrganizer extends AbstractEntity {
  @Column({ name: 'split_bill_id', length: 36 })
  splitBillId: string;

  // FK kept loose so deleting a bill doesn't cascade-clear the audit
  // trail. The service is responsible for guarding access by bill id.
  @ManyToOne(() => SplitBill, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'split_bill_id' })
  splitBill: SplitBill;

  @Column({ type: 'varchar', name: 'user_id', length: 36, nullable: true })
  userId?: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user?: User | null;

  @Column({ name: 'display_name', length: 150 })
  displayName: string;

  @Column({ length: 200, default: 'Organiser' })
  role: string;

  @Column({
    type: 'varchar',
    name: 'avatar_url',
    length: 500,
    nullable: true,
  })
  avatarUrl?: string | null;

  @Column({
    name: 'invitation_status',
    type: 'enum',
    enum: SplitBillOrganizerInvitationStatus,
    default: SplitBillOrganizerInvitationStatus.ACCEPTED,
  })
  invitationStatus: SplitBillOrganizerInvitationStatus =
    SplitBillOrganizerInvitationStatus.ACCEPTED;

  @Column({
    type: 'timestamp',
    precision: 6,
    name: 'responded_at',
    nullable: true,
  })
  respondedAt?: Date | null;

  @Column({
    type: 'text',
    name: 'rejection_reason',
    nullable: true,
  })
  rejectionReason?: string | null;
}
