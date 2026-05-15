import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CampaignExpenditure, Campaign } from '../entities';
import {
  CreateExpenditureDto,
  UpdateExpenditureDto,
} from '../dto/campaign-extras.dto';

@Injectable()
export class CampaignExpenditureService {
  constructor(
    @InjectRepository(CampaignExpenditure)
    private readonly expRepo: Repository<CampaignExpenditure>,
    @InjectRepository(Campaign)
    private readonly campaignRepo: Repository<Campaign>,
  ) {}

  async list(campaignId: string) {
    return this.expRepo.find({
      where: { campaignId },
      relations: ['postedByUser'],
      order: { createdAt: 'DESC' },
    });
  }

  async create(
    campaignId: string,
    userId: string,
    dto: CreateExpenditureDto,
  ) {
    const campaign = await this.campaignRepo.findOne({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.creatorId !== userId) {
      throw new ForbiddenException(
        'Only the campaign creator can post expenditures',
      );
    }

    const exp = this.expRepo.create({
      campaignId,
      label: dto.label,
      amount: dto.amount,
      budgetRef: dto.budgetRef ?? null,
      receipts: dto.receipts ?? null,
      postedBy: userId,
    });
    return this.expRepo.save(exp);
  }

  async update(expId: string, userId: string, dto: UpdateExpenditureDto) {
    const exp = await this.expRepo.findOne({
      where: { id: expId },
      relations: ['campaign'],
    });
    if (!exp) throw new NotFoundException('Expenditure not found');
    if (exp.campaign.creatorId !== userId) {
      throw new ForbiddenException('Only the campaign creator can edit');
    }
    if (dto.label !== undefined) exp.label = dto.label;
    if (dto.amount !== undefined) exp.amount = dto.amount;
    if (dto.budgetRef !== undefined) exp.budgetRef = dto.budgetRef;
    if (dto.receipts !== undefined) exp.receipts = dto.receipts;
    return this.expRepo.save(exp);
  }

  async remove(expId: string, userId: string) {
    const exp = await this.expRepo.findOne({
      where: { id: expId },
      relations: ['campaign'],
    });
    if (!exp) throw new NotFoundException('Expenditure not found');
    if (exp.campaign.creatorId !== userId) {
      throw new ForbiddenException('Only the campaign creator can remove');
    }
    await this.expRepo.remove(exp);
    return { success: true };
  }
}
