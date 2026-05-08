import { DataSource, Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { Donation } from '../entities/donation.entity';

@Injectable()
export class DonationRepository extends Repository<Donation> {
  constructor(private dataSource: DataSource) {
    super(Donation, dataSource.createEntityManager());
  }

  async findByCampaign(campaignId: string): Promise<Donation[]> {
    return this.createQueryBuilder('donation')
      .where('donation.campaignId = :campaignId', { campaignId })
      .leftJoinAndSelect('donation.donor', 'donor')
      .getMany();
  }
}
