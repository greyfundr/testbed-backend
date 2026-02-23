import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { CampaignRepository } from '../repository/campaign.repository';
import { CreateCampaignDto, UpdateCampaignDto } from '../dto/campaign.dto';
import { Campaign } from '../entities/campaign.entity';
import { CampaignStatus } from '../enums/campaign.enum';
import { User } from '../../user/entities/user.entity';

@Injectable()
export class CampaignService {
  private readonly logger = new Logger(CampaignService.name);

  constructor(private readonly campaignRepository: CampaignRepository) { }

  async create(
    createCampaignDto: CreateCampaignDto,
    user: User,
  ): Promise<Campaign> {
    const { participants, ...campaignData } = createCampaignDto;

    const campaign = this.campaignRepository.create({
      ...campaignData,
      target: createCampaignDto.target / 100,
      fee: (createCampaignDto.fee ?? 0) / 100,
      creatorId: user.id,
      currentAmount: 0,
      status: CampaignStatus.ACTIVE,
    });

    return this.campaignRepository.save(campaign);
  }

  async findAll(): Promise<Campaign[]> {
    return this.campaignRepository.find({
      where: { status: CampaignStatus.ACTIVE },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Campaign> {
    const campaign = await this.campaignRepository.findOne({
      where: { id },
      relations: ['creator'],
    });

    if (!campaign) {
      throw new NotFoundException(`Campaign with ID ${id} not found`);
    }

    return campaign;
  }

  async update(
    id: string,
    updateCampaignDto: UpdateCampaignDto,
    user: User,
  ): Promise<Campaign> {
    const campaign = await this.findOne(id);

    if (campaign.creatorId !== user.id) {
      throw new ForbiddenException(
        'You are not authorized to update this campaign',
      );
    }

    const { participants, ...updateData } = updateCampaignDto;

    if (updateData.target) {
      updateData.target = updateData.target / 100;
    }

    Object.assign(campaign, updateData);

    return this.campaignRepository.save(campaign);
  }

  async findMyCampaigns(user: User): Promise<Campaign[]> {
    return this.campaignRepository.findByCreator(user.id);
  }
}
