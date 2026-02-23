import { EntityRepository, Repository } from 'typeorm';
import { Campaign } from '../entities/campaign.entity';

@EntityRepository(Campaign)
export class CampaignRepository extends Repository<Campaign> {
  async findByCreator(creatorId: string): Promise<Campaign[]> {
    return this.find({ where: { creatorId } });
  }
}
