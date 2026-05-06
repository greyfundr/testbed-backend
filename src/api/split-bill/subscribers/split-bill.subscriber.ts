import {
  EntitySubscriberInterface,
  EventSubscriber,
  UpdateEvent,
  InsertEvent,
  RemoveEvent,
  DataSource,
} from 'typeorm';
import { SplitBill } from '../entities';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Injectable } from '@nestjs/common';

@Injectable()
@EventSubscriber()
export class SplitBillSubscriber implements EntitySubscriberInterface<SplitBill> {
  constructor(
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.dataSource.subscribers.push(this);
  }

  listenTo() {
    return SplitBill;
  }

  afterInsert(event: InsertEvent<SplitBill>) {
    console.log('SplitBill created:', event.entity);
    this.eventEmitter.emit('split_bill.created', {
      billId: event.entity.id,
      type: 'INSERTION',
      data: event.entity,
    });
  }

  afterUpdate(event: UpdateEvent<SplitBill>) {
    console.log('SplitBill updated:', event.entity);
    this.eventEmitter.emit('split_bill.updated', {
      billId: event?.entity?.id,
      type: 'UPDATE',
      data: event.entity,
    });
  }

  afterRemove(event: RemoveEvent<SplitBill>) {
    console.log('SplitBill removed:', event.entityId);
    this.eventEmitter.emit('split_bill.deleted', {
      billId: event?.entityId,
      type: 'DELETION',
      data: null,
    });
  }
}
