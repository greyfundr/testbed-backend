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
import {
  CampaignLike,
  CampaignComment,
  CampaignAmplifier,
  CampaignOrganizer,
  Donation,
} from '../entities';
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
import { CampaignSaveService } from './campaign-save.service';
import { CampaignOrganizerService } from './campaign-organizer.service';
import { CampaignAmplifierService } from './campaign-amplifier.service';
import { CampaignVendorService } from './campaign-vendor.service';

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
    private readonly saveService: CampaignSaveService,
    private readonly organizerService: CampaignOrganizerService,
    private readonly amplifierService: CampaignAmplifierService,
    private readonly vendorService: CampaignVendorService,
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
      const {
        participants: participantIds,
        vendors: seedVendors,
        ...campaignData
      } = createCampaignDto;

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
        budget: (createCampaignDto.budget ?? []).map((b) => ({
          ...b,
          id: nanoid(12),
        })),
        images: createCampaignDto.images ?? [],
        target: createCampaignDto.target,
        feePercentage,
        creatorId: user.id,
        currentAmount: 0,
        // Campaigns go live immediately. The PENDING_APPROVAL status is
        // retained on the enum for a future moderation flow but is not
        // applied here today — no approval endpoint currently exists to
        // flip a campaign from pending to active.
        status: CampaignStatus.ACTIVE,
        participants,
        shareSlug: nanoid(12),
      });

      const campaign = await this.campaignRepository.save(
        await campaignInstance,
      );

      savedCampaign = await qr.manager.save(campaign);
      await qr.commitTransaction();

      if (seedVendors?.length) {
        try {
          await this.vendorService.createMany(
            savedCampaign.id,
            user.id,
            seedVendors,
          );
        } catch (vendorErr) {
          this.logger.warn(
            `Campaign ${savedCampaign.id} created but vendor seeding failed`,
            vendorErr,
          );
        }
      }

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

    // Manage-budget sheet sends the full list each save. Preserve ids
    // for existing items so proposals' budgetRef stays valid; mint one
    // for any new item and default image to '' so the entity column
    // stays consistent.
    if (updateData.budget) {
      updateData.budget = updateData.budget.map((b) => ({
        ...b,
        id: b.id && b.id.length > 0 ? b.id : nanoid(12),
        image: b.image ?? '',
      }));
    }

    Object.assign(campaign, updateData);

    return this.campaignRepository.save(campaign);
  }

  // Creator-only status flip. Used by the Manage panel's Pause / Resume
  // / Cancel actions. Donations are blocked for any non-ACTIVE status
  // by [DonationService.donate].
  async updateStatus(
    id: string,
    status: CampaignStatus,
    user: User,
  ): Promise<Campaign> {
    const campaign = await this.findOne(id);

    if (campaign.creatorId !== user.id) {
      throw new ForbiddenException(
        'You are not authorized to change this campaign status',
      );
    }

    campaign.status = status;
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

    const [
      isSaved,
      organizers,
      topAmplifiers,
      financialAccess,
      topDonor,
      distinctDonorsCount,
    ] = await Promise.all([
      currentUserId
        ? this.saveService.isSaved(currentUserId, campaign.id)
        : Promise.resolve(false),
      this.organizerService.list(campaign.id, currentUserId),
      this.amplifierService.topForCampaign(campaign.id, 5),
      this.computeFinancialAccess(campaign, currentUserId),
      this.getTopDonor(campaign.id),
      this.getDistinctDonorsCount(campaign.id),
    ]);

    const creator: CampaignCreatorDto = {
      id: campaign.creator?.id || campaign.creatorId,
      firstName: campaign.creator?.firstName ?? undefined,
      lastName: campaign.creator?.lastName ?? undefined,
      username: campaign.creator?.username ?? undefined,
      profileImage: campaign.creator?.profile?.image ?? undefined,
      accountType: campaign.creator?.accountType ?? undefined,
      kycStatus: (campaign.creator as any)?.kyc?.status ?? undefined,
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
      // Distinct donor count (anonymous-but-authenticated donors
      // included). Beats the prior `loadRelationCountAndMap` which
      // counted donation rows and was only wired on the listing query.
      donorsCount: distinctDonorsCount,
      likesCount,
      commentsCount,
      isLiked,
      isSaved,
      location: campaign.location ?? null,
      urgent: !!campaign.urgent,
      accountabilityNote: campaign.accountabilityNote ?? null,
      story: campaign.story ?? null,
      tiers: campaign.tiers ?? null,
      approvalThresholdMode: campaign.approvalThresholdMode,
      approvalThresholdCount: campaign.approvalThresholdCount ?? null,
      organizers,
      topAmplifiers,
      canSeeFinancials: financialAccess,
      topDonorAmount: topDonor?.amount ?? null,
      topDonor,
    };
  }

  // Financial insight (Collected / Spent / In wallet + wallet hero + extra
  // Financing subtabs) is gated to people who have skin in the game:
  //   - creator
  //   - any listed organizer with a linked user id
  //   - any team participant
  //   - any user who has donated (anonymous donations still carry user_id)
  //   - any amplifier whose referral count is > 0 (i.e. actually drove a paid
  //     donation toward this campaign)
  // Returns false for anonymous viewers.
  private async computeFinancialAccess(
    campaign: Campaign,
    currentUserId?: string,
  ): Promise<boolean> {
    if (!currentUserId) return false;
    if (campaign.creatorId === currentUserId) return true;

    const mgr = this.campaignRepository.getManager();

    // Organizer with a linked user id?
    const organizer = await mgr.getRepository(CampaignOrganizer).findOne({
      where: { campaignId: campaign.id, userId: currentUserId },
    });
    if (organizer) return true;

    // Team participant? participants is loaded via leftJoin when available;
    // fall back to a join-table check otherwise.
    if (
      campaign.participants?.some((p) => p.id === currentUserId) === true
    ) {
      return true;
    }
    const participantRow = await mgr.query(
      'SELECT 1 FROM campaign_participants WHERE campaign_id = ? AND user_id = ? LIMIT 1',
      [campaign.id, currentUserId],
    );
    if (Array.isArray(participantRow) && participantRow.length > 0) {
      return true;
    }

    // Has the viewer donated (anonymous donations still carry donor_id)?
    const donation = await mgr.getRepository(Donation).findOne({
      where: { campaignId: campaign.id, donorId: currentUserId },
      select: { id: true },
    });
    if (donation) return true;

    // Amplifier with at least one attributed (paid) donation?
    const amplifier = await mgr.getRepository(CampaignAmplifier).findOne({
      where: { campaignId: campaign.id, userId: currentUserId },
    });
    if (amplifier) {
      const referralCount = await mgr
        .getRepository(Donation)
        .count({
          where: {
            campaignId: campaign.id,
            referrerAmplifierId: amplifier.id,
          },
        });
      if (referralCount > 0) return true;
    }

    return false;
  }

  private async getTopDonorAmount(campaignId: string): Promise<number | null> {
    const top = await this.getTopDonor(campaignId);
    return top?.amount ?? null;
  }

  // Returns the donor with the largest aggregate contribution to this
  // campaign plus their display name and avatar so the public chip can
  // show "Adekunle ₦50k" instead of just an amount. Donations with no
  // linked donor are excluded (donorId IS NOT NULL).
  //
  // Privacy rule: if every one of the top donor's donations was flagged
  // anonymous (MIN(d.isAnonymous) = 1), the response carries
  // `isAnonymous: true` with name/avatar stripped. The chip renders
  // these as "Anonymous". A donor with even one non-anonymous donation
  // has effectively opted into being named.
  private async getTopDonor(campaignId: string): Promise<{
    donorId: string;
    amount: number;
    name: string | null;
    profileImage: string | null;
    isAnonymous: boolean;
  } | null> {
    const mgr = this.campaignRepository.getManager();
    const row = await mgr
      .getRepository(Donation)
      .createQueryBuilder('d')
      .leftJoin('users', 'u', 'u.id = d.donorId')
      .leftJoin('profiles', 'p', 'p.user_id = u.id')
      .select('d.donorId', 'donorId')
      .addSelect('SUM(d.amount)', 'total')
      .addSelect('MIN(d.isAnonymous)', 'allAnonymous')
      .addSelect('u.first_name', 'firstName')
      .addSelect('u.last_name', 'lastName')
      .addSelect('u.username', 'username')
      .addSelect('p.image', 'profileImage')
      .where('d.campaignId = :cid', { cid: campaignId })
      .andWhere('d.donorId IS NOT NULL')
      .groupBy('d.donorId')
      .addGroupBy('u.first_name')
      .addGroupBy('u.last_name')
      .addGroupBy('u.username')
      .addGroupBy('p.image')
      .orderBy('total', 'DESC')
      .limit(1)
      .getRawOne<{
        donorId: string;
        total: string | null;
        allAnonymous: number | string | null;
        firstName: string | null;
        lastName: string | null;
        username: string | null;
        profileImage: string | null;
      }>();
    if (!row || !row.total) return null;
    const amount = Number(row.total);
    if (!Number.isFinite(amount)) return null;
    const isAnonymous =
      row.allAnonymous === 1 ||
      row.allAnonymous === '1' ||
      // class-validator/typeorm sometimes returns booleans via the
      // numeric transformer; be defensive.
      (row.allAnonymous as unknown) === true;
    const composed =
      [row.firstName, row.lastName]
        .filter((s): s is string => !!s && s.length > 0)
        .join(' ')
        .trim() ||
      row.username ||
      null;
    return {
      donorId: row.donorId,
      amount,
      name: isAnonymous ? null : composed,
      profileImage: isAnonymous ? null : row.profileImage,
      isAnonymous,
    };
  }

  // Distinct supporter count for the public Supporters chip. Counts
  // unique donor_ids (a single donor giving multiple times counts
  // once) including anonymous-but-authenticated donors.
  private async getDistinctDonorsCount(campaignId: string): Promise<number> {
    const mgr = this.campaignRepository.getManager();
    const row = await mgr
      .getRepository(Donation)
      .createQueryBuilder('d')
      .select('COUNT(DISTINCT d.donorId)', 'count')
      .where('d.campaignId = :cid', { cid: campaignId })
      .andWhere('d.donorId IS NOT NULL')
      .getRawOne<{ count: string | null }>();
    const n = Number(row?.count ?? 0);
    return Number.isFinite(n) ? n : 0;
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
