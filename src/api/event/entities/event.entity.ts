import { Entity, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { AbstractEntity } from '../../../common/entities';
import { User } from '../../user/entities';
import { EventCategory } from './event-category.entity';
import { EventOrganizer } from './event-organizer.entity';
import { EventContribution } from './event-contribution.entity';
import { EventStatus } from '../enums/event.enum';
import { BigIntAmountTransformer } from '../../../common/transformers/column-numeric.transformer';

export interface EventLocation {
  lat: number;
  lng: number;
  address: string;
}

export interface DetailedDescription {
  text: string;
  media: string[];
}

export interface ItemToBuy {
  image: string;
  name: string;
  price: number;
  quantity: number;
}

@Entity('events')
export class Event extends AbstractEntity {
  @ApiProperty({ description: 'Event title' })
  @Column()
  title: string;

  @ApiProperty({ description: 'Short description of the event' })
  @Column({ name: 'short_description' })
  shortDescription: string;

  @ApiProperty({ description: 'Detailed description with text and media' })
  @Column({ type: 'json', name: 'detailed_description' })
  detailedDescription: DetailedDescription;

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
    type: 'bigint',
    default: 0,
    name: 'target_amount',
    transformer: new BigIntAmountTransformer(),
  })
  targetAmount: number;

  @ApiProperty({ description: 'Current amount raised' })
  @Column({
    type: 'bigint',
    default: 0,
    name: 'amount_raised',
    transformer: new BigIntAmountTransformer(),
  })
  amountRaised: number;

  @ApiProperty({ description: 'Date and time of the event' })
  @Column({ type: 'timestamp', name: 'event_time' })
  eventTime: Date;

  @ApiProperty({ description: 'Link to event QR code' })
  @Column({ name: 'qr_code_link', nullable: true })
  qrCodeLink: string;

  @ApiProperty({ description: 'Items available for purchase' })
  @Column({ type: 'json', name: 'items_to_buy', nullable: true })
  itemsToBuy: ItemToBuy[] = [];

  @ApiProperty({ description: 'Number of expected participants' })
  @Column({ name: 'expected_participants', default: 0 })
  expectedParticipants: number;

  @ApiProperty({ description: 'Name of the venue' })
  @Column({ name: 'venue_name' })
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
}
