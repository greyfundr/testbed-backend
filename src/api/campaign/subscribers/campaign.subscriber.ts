import {
  EntitySubscriberInterface,
  EventSubscriber,
  UpdateEvent,
  InsertEvent,
  RemoveEvent,
  DataSource,
} from 'typeorm';
import { Campaign } from '../entities/campaign.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

@Injectable()
@EventSubscriber()
export class CampaignSubscriber implements EntitySubscriberInterface<Campaign> {
  private readonly logger = new Logger(CampaignSubscriber.name);

  constructor(
    @InjectDataSource() readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.dataSource.subscribers.push(this);
  }

  listenTo() {
    return Campaign;
  }

  afterInsert(event: InsertEvent<Campaign>) {
    this.logger.log(`Campaign Created: ${event.entity.id}`);
    this.eventEmitter.emit('campaign.created', {
      campaignId: event.entity.id,
      type: 'INSERTION',
      data: event.entity,
    });
  }

  afterUpdate(event: UpdateEvent<Campaign>) {
    const campaignId = event.entity?.id || event.databaseEntity?.id;
    this.logger.log(`Campaign Updated: ${campaignId}`);

    this.eventEmitter.emit('campaign.updated', {
      campaignId: campaignId,
      type: 'UPDATE',
      data: event.entity,
    });
  }

  afterRemove(event: RemoveEvent<Campaign>) {
    this.logger.log(`Campaign Deleted: ${event.entityId}`);
    this.eventEmitter.emit('campaign.deleted', {
      campaignId: event.entityId,
      type: 'DELETION',
      data: null,
    });
  }
}
