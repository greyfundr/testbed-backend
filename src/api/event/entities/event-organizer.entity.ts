import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { User } from '../../user/entities';
import { Event } from './event.entity';
import { EventOrganizerRole } from '../enums/event.enum';

@Entity('event_organizers')
export class EventOrganizer extends AbstractEntity {
  @Column({ name: 'event_id' })
  eventId: string;

  @ManyToOne(() => Event, (event) => event.organizers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event: Event;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    type: 'enum',
    enum: EventOrganizerRole,
    default: EventOrganizerRole.CO_ORGANIZER,
  })
  role: EventOrganizerRole;
}
