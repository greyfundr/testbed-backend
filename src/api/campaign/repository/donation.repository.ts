import { EntityRepository, Repository } from 'typeorm';
import { Donation } from '../entities/donation.entity';

@EntityRepository(Donation)
export class DonationRepository extends Repository<Donation> {
  async findByCampaign(campaignId: string): Promise<Donation[]> {
    return this.find({ where: { campaignId }, relations: ['donor'] });
  }
}
