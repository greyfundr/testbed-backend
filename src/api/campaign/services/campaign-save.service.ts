import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CampaignSave, Campaign } from '../entities';

@Injectable()
export class CampaignSaveService {
  constructor(
    @InjectRepository(CampaignSave)
    private readonly saveRepository: Repository<CampaignSave>,
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
  ) {}

  async save(userId: string, campaignId: string) {
    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');

    const existing = await this.saveRepository.findOne({
      where: { userId, campaignId },
    });
    if (existing) throw new ConflictException('Campaign already saved');

    const saved = this.saveRepository.create({ userId, campaignId });
    await this.saveRepository.save(saved);
    return { success: true };
  }

  async unsave(userId: string, campaignId: string) {
    const existing = await this.saveRepository.findOne({
      where: { userId, campaignId },
    });
    if (!existing) throw new NotFoundException('Save record not found');
    await this.saveRepository.remove(existing);
    return { success: true };
  }

  async isSaved(userId: string, campaignId: string): Promise<boolean> {
    const count = await this.saveRepository.count({
      where: { userId, campaignId },
    });
    return count > 0;
  }

  async getUserSaves(userId: string) {
    const records = await this.saveRepository.find({
      where: { userId },
      relations: ['campaign'],
      order: { createdAt: 'DESC' },
    });
    return records.map((r) => r.campaign);
  }
}
