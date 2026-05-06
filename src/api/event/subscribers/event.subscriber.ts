import {
  EntitySubscriberInterface,
  EventSubscriber,
  UpdateEvent,
  InsertEvent,
  RemoveEvent,
  DataSource,
} from 'typeorm';
import { Event } from '../entities/event.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

@Injectable()
@EventSubscriber()
export class EventEntitySubscriber implements EntitySubscriberInterface<Event> {
  private readonly logger = new Logger(EventSubscriber.name);

  constructor(
    @InjectDataSource() readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.dataSource.subscribers.push(this);
  }

  listenTo() {
    return Event;
  }

  afterInsert(event: InsertEvent<Event>) {
    this.logger.log(`Event Created: ${event.entity.id}`);
    this.eventEmitter.emit('event.created', {
      eventId: event.entity.id,
      type: 'INSERTION',
      data: event.entity,
    });
  }

  afterUpdate(event: UpdateEvent<Event>) {
    const eventId = event.entity?.id || event.databaseEntity?.id;
    this.logger.log(`Event Updated: ${eventId}`);

    this.eventEmitter.emit('event.updated', {
      eventId: eventId,
      type: 'UPDATE',
      data: event.entity,
    });
  }

  afterRemove(event: RemoveEvent<Event>) {
    this.logger.log(`Event Deleted: ${event.entityId}`);
    this.eventEmitter.emit('event.deleted', {
      eventId: event.entityId,
      type: 'DELETION',
      data: null,
    });
  }
}
