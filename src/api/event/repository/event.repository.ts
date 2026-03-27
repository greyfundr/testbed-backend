import {
  Event,
  EventCategory,
  EventOrganizer,
  EventContribution,
  EventRsvp,
} from '../entities';
import { AbstractRepository } from '../../../common/entities';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

export class EventRepository extends AbstractRepository<Event> {
  constructor(@InjectRepository(Event) repo: Repository<Event>) {
    super(repo);
  }
}

export class EventCategoryRepository extends AbstractRepository<EventCategory> {
  constructor(
    @InjectRepository(EventCategory) repo: Repository<EventCategory>,
  ) {
    super(repo);
  }
}

export class EventOrganizerRepository extends AbstractRepository<EventOrganizer> {
  constructor(
    @InjectRepository(EventOrganizer) repo: Repository<EventOrganizer>,
  ) {
    super(repo);
  }
}

export class EventContributionRepository extends AbstractRepository<EventContribution> {
  constructor(
    @InjectRepository(EventContribution) repo: Repository<EventContribution>,
  ) {
    super(repo);
  }
}

export class EventRsvpRepository extends AbstractRepository<EventRsvp> {
  constructor(@InjectRepository(EventRsvp) repo: Repository<EventRsvp>) {
    super(repo);
  }
}
