import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Campaign, CampaignLike, CampaignComment } from '../entities';
import { User } from '../../user/entities/user.entity';
import { CampaignStatus } from '../enums/campaign.enum';
import { CreateCommentDto } from '../dto/campaign-interaction.dto';
import { NotificationService } from '../../notification/services/notification.service';

@Injectable()
export class CampaignInteractionService {
  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    @InjectRepository(CampaignLike)
    private readonly likeRepository: Repository<CampaignLike>,
    @InjectRepository(CampaignComment)
    private readonly commentRepository: Repository<CampaignComment>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly notificationService: NotificationService,
  ) {}

  async likeCampaign(userId: string, campaignId: string) {
    const campaign = await this.getApprovedCampaign(campaignId);

    const existingLike = await this.likeRepository.findOne({
      where: { userId, campaignId },
    });

    if (existingLike) {
      throw new ConflictException('You have already liked this campaign');
    }

    const like = this.likeRepository.create({ userId, campaignId });
    await this.likeRepository.save(like);

    // Notify creator
    if (campaign.creatorId !== userId) {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      const name = user?.firstName ? `${user.firstName} ${user.lastName}` : 'Someone';

      await this.notificationService.notify(campaign.creatorId, 'socialInteractions', {
        title: 'New Like',
        message: `${name} liked your campaign: ${campaign.title}`,
        type: 'CAMPAIGN_LIKE',
        metadata: { campaignId, userId, pushToken: campaign.creator?.fcmToken },
      });
    }

    return { success: true, message: 'Campaign liked successfully' };
  }

  async unlikeCampaign(userId: string, campaignId: string) {
    const like = await this.likeRepository.findOne({
      where: { userId, campaignId },
    });

    if (!like) {
      throw new NotFoundException('Like record not found');
    }

    await this.likeRepository.remove(like);

    // Notify creator (optional, but requested)
    const campaign = await this.campaignRepository.findOne({ where: { id: campaignId }, relations: ['creator'] });
    if (campaign && campaign.creatorId !== userId) {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      const name = user?.firstName ? `${user.firstName} ${user.lastName}` : 'Someone';

      await this.notificationService.notify(campaign.creatorId, 'socialInteractions', {
        title: 'Like Removed',
        message: `${name} unliked your campaign: ${campaign.title}`,
        type: 'CAMPAIGN_UNLIKE',
        metadata: { campaignId, userId, pushToken: campaign.creator?.fcmToken },
      });
    }

    return { success: true, message: 'Campaign unliked successfully' };
  }

  async addComment(userId: string, campaignId: string, dto: CreateCommentDto) {
    const campaign = await this.getApprovedCampaign(campaignId);

    const comment = this.commentRepository.create({
      userId,
      campaignId,
      content: dto.content,
    });

    await this.commentRepository.save(comment);

    // Notify creator
    if (campaign.creatorId !== userId) {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      const name = user?.firstName ? `${user.firstName} ${user.lastName}` : 'Someone';

      await this.notificationService.notify(campaign.creatorId, 'socialInteractions', {
        title: 'New Comment',
        message: `${name} commented on your campaign: ${campaign.title}`,
        type: 'CAMPAIGN_COMMENT',
        metadata: { campaignId, userId, commentId: comment.id, pushToken: campaign.creator?.fcmToken },
      });
    }

    return comment;
  }

  async getComments(campaignId: string) {
    return this.commentRepository.find({
      where: { campaignId },
      relations: ['user', 'user.profile'],
      order: { createdAt: 'DESC' },
    });
  }

  private async getApprovedCampaign(campaignId: string) {
    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId },
      relations: ['creator'],
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    if (campaign.status !== CampaignStatus.ACTIVE) {
      throw new BadRequestException('This campaign is not yet approved and active');
    }

    return campaign;
  }
}
