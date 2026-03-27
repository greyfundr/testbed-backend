import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { User } from '../../user/entities';
import { Event } from './event.entity';

export enum RsvpStatus {
  ATTENDING = 'attending',
  NOT_ATTENDING = 'not_attending',
  MAYBE = 'maybe',
}

@Entity('event_rsvps')
@Index(['eventId', 'userId'], { unique: true, where: '"user_id" IS NOT NULL' })
@Index(['eventId', 'guestEmail'], {
  unique: true,
  where: '"guest_email" IS NOT NULL',
})
export class EventRsvp extends AbstractEntity {
  @Index()
  @Column({ name: 'event_id' })
  eventId: string;

  @ManyToOne(() => Event, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event: Event;

  @Index()
  @Column({ type: 'varchar', nullable: true, name: 'user_id' })
  userId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'guest_email' })
  guestEmail: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true, name: 'guest_phone' })
  guestPhone: string | null;

  @Column({
    type: 'varchar',
    default: RsvpStatus.ATTENDING,
  })
  status: RsvpStatus;

  @Column({ type: 'int', default: 1, name: 'guest_count' })
  guestCount: number;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'boolean', default: true, name: 'self_registered' })
  selfRegistered: boolean;

  @Column({ type: 'timestamp', nullable: true, name: 'responded_at' })
  respondedAt: Date | null;
}
