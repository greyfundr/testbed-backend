import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Campaign, CampaignOrganizer, CampaignUpdate } from '../entities';
import { User } from '../../user/entities';
import {
  CampaignUpdateResponseDto,
  CreateCampaignUpdateDto,
} from '../dto/campaign-update.dto';

@Injectable()
export class CampaignUpdateService {
  constructor(
    @InjectRepository(CampaignUpdate)
    private readonly updateRepo: Repository<CampaignUpdate>,
    @InjectRepository(Campaign)
    private readonly campaignRepo: Repository<Campaign>,
    @InjectRepository(CampaignOrganizer)
    private readonly organizerRepo: Repository<CampaignOrganizer>,
  ) {}

  // GET /campaigns/:id/updates — public. Pinned posts first, then
  // newest-first by createdAt. Author user is joined so the response
  // includes a small author dto for rendering name/avatar.
  async list(campaignId: string): Promise<CampaignUpdateResponseDto[]> {
    const rows = await this.updateRepo.find({
      where: { campaignId },
      relations: ['author'],
      order: { pinned: 'DESC', createdAt: 'DESC' },
    });
    return rows.map((u) => this.toDto(u));
  }

  // POST /campaigns/:id/updates — only the campaign's creator or one
  // of its organisers (linked via CampaignOrganizer.userId) may post.
  async create(
    campaignId: string,
    user: User,
    dto: CreateCampaignUpdateDto,
  ): Promise<CampaignUpdateResponseDto> {
    const campaign = await this.campaignRepo.findOne({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');

    const isCreator = campaign.creatorId === user.id;
    const isOrganiser = isCreator
      ? false
      : !!(await this.organizerRepo.findOne({
          where: { campaignId, userId: user.id },
        }));

    if (!isCreator && !isOrganiser) {
      throw new ForbiddenException(
        'Only the creator or an organiser can post an update',
      );
    }

    const entity = this.updateRepo.create({
      campaignId,
      authorId: user.id,
      body: dto.body,
      pinned: dto.pinned ?? false,
    });
    const saved = await this.updateRepo.save(entity);
    const withAuthor = await this.updateRepo.findOne({
      where: { id: saved.id },
      relations: ['author'],
    });
    return this.toDto(withAuthor as CampaignUpdate);
  }

  private toDto(u: CampaignUpdate): CampaignUpdateResponseDto {
    const a = u.author;
    return {
      id: u.id,
      campaignId: u.campaignId,
      body: u.body,
      pinned: !!u.pinned,
      createdAt: u.createdAt,
      author: {
        id: a?.id ?? u.authorId,
        firstName: a?.firstName ?? undefined,
        lastName: a?.lastName ?? undefined,
        profileImage: (a as any)?.profile?.image ?? undefined,
      },
    };
  }
}
