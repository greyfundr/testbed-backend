import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CampaignRepository } from '../repository/campaign.repository';
import {
  CampaignFilterDto,
  CreateCampaignDto,
  UpdateCampaignDto,
} from '../dto/campaign.dto';
import { Campaign } from '../entities/campaign.entity';
import { CampaignStatus } from '../enums/campaign.enum';
import { User } from '../../user/entities/user.entity';
import { UserRepository } from '../../user/repository/user.repository';
import {
  PaginationDto,
  PaginatedResponse,
  PaginationHelper,
} from '../../../common/helpers/pagination.helper';
import {
  CampaignResponseDto,
  CampaignCreatorDto,
} from '../dto/campaign-response.dto';
import { CampaignCategoryRepository } from '../repository/campaign-category.repository';
import { nanoid } from 'nanoid';
import { ILike } from 'typeorm';

@Injectable()
export class CampaignService {
  private readonly logger = new Logger(CampaignService.name);

  constructor(
    private readonly campaignRepository: CampaignRepository,
    private readonly campaignCategoryRepository: CampaignCategoryRepository,
    private readonly userRepository: UserRepository,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(
    createCampaignDto: CreateCampaignDto,
    user: User,
  ): Promise<Campaign> {
    const { participants: participantIds, ...campaignData } = createCampaignDto;

    const participants = participantIds?.length
      ? await this.userRepository.findAll({
          where: participantIds.map((id) => ({ id })),
        })
      : [];

    const feePercentage = this.configService.get<number>(
      'CAMPAIGN_FEE_PERCENTAGE',
      5,
    );
    const targetAmount = createCampaignDto.target;

    const existingCategory = await this.campaignCategoryRepository.findOne({
      where: { id: campaignData.category },
    });

    if (!existingCategory) {
      throw new NotFoundException(
        `Campaign category with ID ${campaignData.category} not found`,
      );
    }

    const campaign = await this.campaignRepository.create({
      ...campaignData,
      category: existingCategory,
      offers: createCampaignDto.offers ?? [],
      budget: createCampaignDto.budget ?? [],
      images: createCampaignDto.images ?? [],
      target: targetAmount,
      feePercentage,
      creatorId: user.id,
      currentAmount: 0,
      status: CampaignStatus.ACTIVE,
      participants,
      shareSlug: nanoid(12),
    });

    this.eventEmitter.emit('admin.campaign_created', {
      campaignId: campaign.id,
      campaignTitle: campaign.title,
      creatorId: user.id,
    });

    return campaign;
  }

  async findAll(
    filterDto: CampaignFilterDto,
  ): Promise<PaginatedResponse<CampaignResponseDto>> {
    const { page, limit, category } = filterDto;
    const skip = filterDto.getSkip();

    const whereCondition: any = {
      status: CampaignStatus.ACTIVE,
    };

    if (category) {
      whereCondition.category = { name: ILike(category) };
    }

    const [data, total] = await this.campaignRepository.findAndCount({
      where: whereCondition,
      relations: ['creator', 'creator.profile', 'category'],
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return PaginationHelper.createResponse(
      data.map((campaign) => this.mapToResponse(campaign)),
      total,
      page ?? 1,
      limit ?? 10,
    );
  }

  async findOne(id: string): Promise<Campaign> {
    const campaign = await this.campaignRepository.findOne({
      where: { id },
      relations: ['creator', 'creator.profile'],
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

    const { participants: participantIds, ...updateData } = updateCampaignDto;

    if (participantIds) {
      campaign.participants = await this.userRepository.findAll({
        where: participantIds.map((id) => ({ id })),
      });
    }

    if (updateData.target) {
      updateData.target = updateData.target;
    }

    Object.assign(campaign, updateData);

    return this.campaignRepository.save(campaign);
  }

  async findMyCampaigns(user: User): Promise<CampaignResponseDto[]> {
    const campaigns = await this.campaignRepository.findAll({
      where: { creatorId: user.id },
      relations: ['creator', 'creator.profile'],
      order: { createdAt: 'DESC' },
    });
    return campaigns.map((campaign) => this.mapToResponse(campaign));
  }

  public mapToResponse(campaign: Campaign): CampaignResponseDto {
    const creator: CampaignCreatorDto = {
      id: campaign.creator?.id || campaign.creatorId,
      firstName: campaign.creator?.firstName ?? undefined,
      lastName: campaign.creator?.lastName ?? undefined,
      username: campaign.creator?.username ?? undefined,
      profileImage: campaign.creator?.profile?.image ?? undefined,
    };

    return {
      id: campaign.id,
      title: campaign.title,
      description: campaign.description,
      category: campaign.category,
      target: campaign.target,
      currentAmount: campaign.currentAmount,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      offers: campaign.offers,
      budget: campaign.budget,
      images: campaign.images,
      status: campaign.status,
      shareSlug: campaign.shareSlug,
      shareUrl: `${this.configService.get<string>(
        'API_BASE_URL',
      )}/campaigns/${campaign.shareSlug}`,
      creator,
      createdAt: campaign.createdAt,
    };
  }

  async getCampaignCategories(): Promise<
    { id: string; name: string; icon: string | null }[]
  > {
    const categories = await this.campaignCategoryRepository.findAll();
    return categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      icon: cat.icon,
    }));
  }
}
