import { Entity, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { AbstractEntity } from '../../../common/entities';
import { User } from '../../user/entities';
import { EventCategory } from './event-category.entity';
import { EventOrganizer } from './event-organizer.entity';
import { EventContribution } from './event-contribution.entity';
import { EventStatus, EventVisibilityStatus } from '../enums/event.enum';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';
import { EventRsvp } from './event-rsvp.entity';

export interface EventLocation {
  lat: number;
  lng: number;
  address: string;
  locationDescription?: string;
  venueName?: string;
}

export interface DetailedDescriptionSegment {
  title?: string;
  text: string;
  media: string[];
}

export interface PurchasableItem {
  images: string[];
  name: string;
  price: number;
  quantity: number;
}

export interface EventActivity {
  name: string;
  image: string;
  description: string;
  targetAmount: number;
  time: string;
}

export interface ExternalOrganizer {
  name: string;
  number: string;
}

@Entity('events')
export class Event extends AbstractEntity {
  @ApiProperty({ description: 'Event name' })
  @Column()
  name: string;

  @ApiProperty({ description: 'Event title', deprecated: true })
  @Column({ name: 'title', nullable: true })
  title: string;

  @ApiProperty({ description: 'Short description of the event' })
  @Column({ name: 'short_description' })
  shortDescription: string;

  @ApiProperty({
    description: 'Detailed description with text and media segments',
  })
  @Column({ type: 'json', name: 'detailed_description' })
  detailedDescription: DetailedDescriptionSegment[];

  @ApiProperty({ description: 'Cover images for the event' })
  @Column({ type: 'json', name: 'cover_images', nullable: true })
  coverImages: string[] = [];

  @Column({ name: 'category_id' })
  categoryId: string;

  @ManyToOne(() => EventCategory)
  @JoinColumn({ name: 'category_id' })
  category: EventCategory;

  @ApiProperty({ description: 'Event location coordinates and address' })
  @Column({ type: 'json' })
  location: EventLocation;

  @ApiProperty({ description: 'Event hashtag', maxLength: 30 })
  @Column({ length: 30 })
  hashtag: string;

  @ApiProperty({ description: 'Target amount to be raised' })
  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: 0,
    name: 'target_amount',
    transformer: new ColumnNumericTransformer(),
  })
  targetAmount: number;

  @ApiProperty({ description: 'Current amount raised' })
  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: 0,
    name: 'amount_raised',
    transformer: new ColumnNumericTransformer(),
  })
  amountRaised: number;

  @ApiProperty({ description: 'Accept donations' })
  @Column({ name: 'accept_donations', default: true })
  acceptDonations: boolean;

  @ApiProperty({ description: 'Start date and time of the event' })
  @Column({ type: 'timestamp', name: 'start_date_time' })
  startDateTime: Date;

  @ApiProperty({ description: 'End date and time of the event' })
  @Column({ type: 'timestamp', name: 'end_date_time', nullable: true })
  endDateTime: Date | null;

  @ApiProperty({ description: 'Start time string' })
  @Column({ type: 'varchar', name: 'start_time', nullable: true })
  startTime: string | null;

  @ApiProperty({ description: 'Link to event QR code' })
  @Column({ type: 'varchar', name: 'qr_code_link', nullable: true })
  qrCodeLink: string | null;

  @ApiProperty({ description: 'Items available for purchase' })
  @Column({ type: 'json', name: 'purchasable_items', nullable: true })
  purchasableItems: PurchasableItem[] | null = [];

  @ApiProperty({ description: 'Planned activities for the event' })
  @Column({ type: 'json', name: 'activities', nullable: true })
  activities: EventActivity[] | null = [];

  @ApiProperty({ description: 'External organizers not in the system' })
  @Column({ type: 'json', name: 'external_organizers', nullable: true })
  externalOrganizers: ExternalOrganizer[] | null = [];

  @ApiProperty({ description: 'Number of expected participants' })
  @Column({ type: 'int', name: 'expected_participants', default: 0 })
  expectedParticipants: number;

  @ApiProperty({ description: 'Name of the venue' })
  @Column({ type: 'varchar', name: 'venue_name' })
  venueName: string;

  @Column({ name: 'creator_id' })
  creatorId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'creator_id' })
  creator: User;

  @ApiProperty({ description: 'Event status', enum: EventStatus })
  @Column({
    type: 'enum',
    enum: EventStatus,
    default: EventStatus.ACTIVE,
  })
  status: EventStatus;

  @OneToMany('EventOrganizer', (organizer: any) => organizer.event)
  organizers: EventOrganizer[];

  @OneToMany('EventContribution', (contribution: any) => contribution.event)
  contributions: EventContribution[];

  @Column({ name: 'page_number', default: 1 })
  pageNumber: number;

  @Column({ type: 'boolean', name: 'is_approved', default: false })
  isApproved: boolean;

  @Column({ type: 'varchar', name: 'rejection_reason', nullable: true })
  rejectionReason: string | null;

  @Column({
    type: 'varchar',
    default: EventVisibilityStatus.PUBLIC,
    name: 'visibility_status',
  })
  visibilityStatus: EventVisibilityStatus;

  @Column({ type: 'boolean', name: 'is_published', default: false })
  isPublished: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'share_link' })
  shareLink: string | null;

  @OneToMany(() => EventRsvp, (rsvp) => rsvp.event)
  rsvps: EventRsvp[];

  @Column({ type: 'int', name: 'rsvp_count', default: 0 })
  rsvpCount?: number;

  @Column({ type: 'boolean', name: 'hide_donation_amount', default: false })
  hideDonationAmount: boolean;

  @ApiProperty({ description: 'Total RSVPs for physical venue' })
  venueCount?: number;

  @ApiProperty({ description: 'Total RSVPs for online attendance' })
  onlineCount?: number;
}
