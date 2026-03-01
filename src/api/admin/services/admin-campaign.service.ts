import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { CampaignRepository } from '../../campaign/repository/campaign.repository';
import { CampaignStatus } from '../../campaign/enums/campaign.enum';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class AdminCampaignService {
  private readonly logger = new Logger(AdminCampaignService.name);

  constructor(
    private readonly campaignRepository: CampaignRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getCampaigns(status?: CampaignStatus) {
    const query: any = {};
    if (status) {
      query.status = status;
    }

    return this.campaignRepository.findAll({
      where: query,
      order: { createdAt: 'DESC' },
      relations: ['creator'],
    });
  }

  async approveCampaign(campaignId: string) {
    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId },
      relations: ['creator'],
    });

    if (!campaign) {
      throw new NotFoundException(`Campaign with ID ${campaignId} not found`);
    }

    if (campaign.status === CampaignStatus.ACTIVE) {
      throw new ConflictException('Campaign is already active');
    }

    // Approve campaign
    const updatedCampaign = await this.campaignRepository.update(campaign.id, {
      status: CampaignStatus.ACTIVE,
    });

    // Notify the creator
    this.eventEmitter.emit('campaign.live', {
      userUuid: campaign.creator.id,
      campaignName: campaign.title,
      email: campaign.creator.email,
    });

    return updatedCampaign;
  }
}
