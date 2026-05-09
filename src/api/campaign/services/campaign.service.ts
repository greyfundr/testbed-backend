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
import { CampaignLike, CampaignComment } from '../entities';
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
import { DataSource, ILike } from 'typeorm';
import { DynamicLinkService } from 'src/api/dynamic-link/services/dynamic-link.service';

@Injectable()
export class CampaignService {
  private readonly logger = new Logger(CampaignService.name);

  constructor(
    private readonly campaignRepository: CampaignRepository,
    private readonly campaignCategoryRepository: CampaignCategoryRepository,
    private readonly dynamicLinkService: DynamicLinkService,
    private readonly dataSource: DataSource,
    private readonly userRepository: UserRepository,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(
    createCampaignDto: CreateCampaignDto,
    user: User,
  ): Promise<Campaign> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    let savedCampaign: Campaign;

    try {
      const { participants: participantIds, ...campaignData } =
        createCampaignDto;

      const participants = participantIds?.length
        ? await this.userRepository.findAll({
            where: participantIds.map((id) => ({ id })),
          })
        : [];

      const feePercentage = this.configService.get<number>(
        'CAMPAIGN_FEE_PERCENTAGE',
        5,
      );

      const existingCategory = await this.campaignCategoryRepository.findOne({
        where: { id: campaignData.category },
      });

      if (!existingCategory) {
        throw new NotFoundException(
          `Campaign category with ID ${campaignData.category} not found`,
        );
      }

      const campaignInstance = this.campaignRepository.create({
        ...campaignData,
        category: existingCategory,
        offers: createCampaignDto.offers ?? [],
        budget: createCampaignDto.budget ?? [],
        images: createCampaignDto.images ?? [],
        target: createCampaignDto.target,
        feePercentage,
        creatorId: user.id,
        currentAmount: 0,
        status: CampaignStatus.PENDING_APPROVAL,
        participants,
        shareSlug: nanoid(12),
      });

      const campaign = await this.campaignRepository.save(
        await campaignInstance,
      );

      savedCampaign = await qr.manager.save(campaign);
      await qr.commitTransaction();

      this.eventEmitter.emit('admin.campaign_created', {
        campaignId: campaign.id,
        campaignTitle: campaign.title,
        creatorId: user.id,
      });
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }

    try {
      const { shortUrl } = await this.dynamicLinkService.forCampaign(
        savedCampaign.id,
        savedCampaign.shareSlug ?? savedCampaign.id,
        savedCampaign.title,
      );

      if (shortUrl) {
        await this.campaignRepository.update(savedCampaign.id, {
          shareLink: shortUrl,
        });
        savedCampaign.shareLink = shortUrl;
      }
    } catch (linkErr) {
      this.logger.warn(
        `Campaign created but failed to generate short link for ${savedCampaign.id}`,
        linkErr,
      );
    }

    return savedCampaign;
  }

  async findAll(
    filterDto: CampaignFilterDto,
    currentUserId?: string,
  ): Promise<PaginatedResponse<CampaignResponseDto>> {
    const { page, limit, category } = filterDto;
    const skip = filterDto.getSkip();

    const query = this.campaignRepository
      .createQueryBuilder('campaign')
      .leftJoinAndSelect('campaign.creator', 'creator')
      .leftJoinAndSelect('creator.profile', 'profile')
      .leftJoinAndSelect('campaign.category', 'category')
      .loadRelationCountAndMap('campaign.donorsCount', 'campaign.donations')
      .where('campaign.status = :status', { status: CampaignStatus.ACTIVE })
      .orderBy('campaign.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (category) {
      query.andWhere('category.name LIKE :category', {
        category: `%${category}%`,
      });
    }

    const [data, total] = await query.getManyAndCount();

    return PaginationHelper.createResponse(
      await Promise.all(
        data.map((campaign) => this.mapToResponse(campaign, currentUserId)),
      ),
      total,
      page ?? 1,
      limit ?? 10,
    );
  }

  async findOne(id: string): Promise<Campaign> {
    const campaign = await this.campaignRepository
      .createQueryBuilder('campaign')
      .leftJoinAndSelect('campaign.creator', 'creator')
      .leftJoinAndSelect('creator.profile', 'profile')
      .leftJoinAndSelect('campaign.participants', 'participants')
      .where('campaign.id = :id', { id })
      .getOne();

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
    return Promise.all(
      campaigns.map((campaign) => this.mapToResponse(campaign, user.id)),
    );
  }

  public async mapToResponse(
    campaign: Campaign,
    currentUserId?: string,
  ): Promise<CampaignResponseDto> {
    const likesCount = await this.campaignRepository
      .getManager()
      .getRepository(CampaignLike)
      .count({ where: { campaignId: campaign.id } });
    const commentsCount = await this.campaignRepository
      .getManager()
      .getRepository(CampaignComment)
      .count({ where: { campaignId: campaign.id } });

    let isLiked = false;
    if (currentUserId) {
      const like = await this.campaignRepository
        .getManager()
        .getRepository(CampaignLike)
        .findOne({ where: { userId: currentUserId, campaignId: campaign.id } });
      isLiked = !!like;
    }

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
      participants:
        campaign.participants?.map((p) => ({
          id: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          username: p.username,
          profileImage: p.profile?.image,
        })) || [],
      shareSlug: campaign.shareSlug,
      shareUrl: campaign.shareLink as string,
      creator,
      createdAt: campaign.createdAt,
      donorsCount: campaign.donorsCount ?? 0,
      likesCount,
      commentsCount,
      isLiked,
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
