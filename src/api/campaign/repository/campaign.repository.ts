import { Campaign } from '../entities/campaign.entity';
import { AbstractRepository } from '../../../common/entities';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

export class CampaignRepository extends AbstractRepository<Campaign> {
  constructor(@InjectRepository(Campaign) repo: Repository<Campaign>) {
    super(repo);
  }
}
