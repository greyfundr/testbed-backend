import { AbstractRepository } from '../../../common/entities';
import { WebhookLog } from '../entities';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

export class WebhookLogRepository extends AbstractRepository<WebhookLog> {
  constructor(@InjectRepository(WebhookLog) repo: Repository<WebhookLog>) {
    super(repo);
  }
}
