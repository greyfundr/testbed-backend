import { AbstractRepository } from '../../../common/entities';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CampaignCategory } from '../entities';

export class CampaignCategoryRepository extends AbstractRepository<CampaignCategory> {
  constructor(
    @InjectRepository(CampaignCategory) repo: Repository<CampaignCategory>,
  ) {
    super(repo);
  }
}
