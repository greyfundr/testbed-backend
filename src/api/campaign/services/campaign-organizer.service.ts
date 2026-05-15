import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CampaignOrganizer,
  CampaignOrganizerFollow,
  Campaign,
} from '../entities';
import { OrganizerInvitationStatus } from '../entities/campaign-organizer.entity';
import {
  CreateOrganizerDto,
  UpdateOrganizerDto,
} from '../dto/campaign-extras.dto';
import { User } from '../../user/entities';
import { NotificationService } from '../../notification/services/notification.service';

@Injectable()
export class CampaignOrganizerService {
  constructor(
    @InjectRepository(CampaignOrganizer)
    private readonly organizerRepo: Repository<CampaignOrganizer>,
    @InjectRepository(CampaignOrganizerFollow)
    private readonly followRepo: Repository<CampaignOrganizerFollow>,
    @InjectRepository(Campaign)
    private readonly campaignRepo: Repository<Campaign>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly notificationService: NotificationService,
  ) {}

  async list(campaignId: string, currentUserId?: string) {
    // Public rail surfaces only accepted organisers; pending and
    // rejected rows stay backend-side so donors don't see invitee
    // status leaks.
    const organizers = await this.organizerRepo.find({
      where: {
        campaignId,
        invitationStatus: OrganizerInvitationStatus.ACCEPTED,
      },
      relations: ['user'],
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });

    if (!organizers.length) return [];

    const organizerIds = organizers.map((o) => o.id);

    const followRows = await this.followRepo
      .createQueryBuilder('f')
      .select('f.organizer_id', 'organizerId')
      .addSelect('COUNT(*)', 'count')
      .where('f.organizer_id IN (:...ids)', { ids: organizerIds })
      .groupBy('f.organizer_id')
      .getRawMany<{ organizerId: string; count: string }>();
    const counts = new Map(
      followRows.map((r) => [r.organizerId, Number(r.count)]),
    );

    let followingIds = new Set<string>();
    if (currentUserId) {
      const myFollows = await this.followRepo.find({
        where: { userId: currentUserId },
      });
      followingIds = new Set(myFollows.map((f) => f.organizerId));
    }

    return organizers.map((o) => ({
      ...o,
      followersCount: counts.get(o.id) ?? 0,
      isFollowing: followingIds.has(o.id),
    }));
  }

  async create(
    campaignId: string,
    creatorId: string,
    dto: CreateOrganizerDto,
  ) {
    const campaign = await this.campaignRepo.findOne({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.creatorId !== creatorId) {
      throw new ForbiddenException(
        'Only the campaign creator can add organizers',
      );
    }

    // When `userId` is supplied we treat this as an invitation: status
    // starts as PENDING, the invitee gets a notification, and the row
    // only appears in the public rail after they accept. Free-form
    // rows (no userId) skip this flow and land as ACCEPTED so the
    // legacy add-by-name behaviour still works.
    const invitee = dto.userId
      ? await this.userRepo.findOne({ where: { id: dto.userId } })
      : null;
    if (dto.userId && !invitee) {
      throw new NotFoundException('Invitee user not found');
    }
    if (invitee && invitee.id === creatorId) {
      throw new ConflictException(
        "You're already the creator — you can't invite yourself as an organiser",
      );
    }
    if (invitee) {
      const existing = await this.organizerRepo.findOne({
        where: { campaignId, userId: invitee.id },
      });
      if (existing) {
        throw new ConflictException(
          existing.invitationStatus === OrganizerInvitationStatus.PENDING
            ? 'This user already has a pending invitation'
            : existing.invitationStatus === OrganizerInvitationStatus.ACCEPTED
              ? 'This user is already an organiser'
              : 'This user previously rejected an invitation',
        );
      }
    }

    const status = invitee
      ? OrganizerInvitationStatus.PENDING
      : OrganizerInvitationStatus.ACCEPTED;

    const organizer = this.organizerRepo.create({
      campaignId,
      userId: dto.userId ?? null,
      displayName: dto.displayName,
      role: dto.role,
      avatarUrl: dto.avatarUrl ?? null,
      brandColor: dto.brandColor ?? null,
      verified: dto.verified ?? false,
      sortOrder: dto.sortOrder ?? 0,
      invitationStatus: status,
    });
    const saved = await this.organizerRepo.save(organizer);

    if (invitee) {
      await this.notificationService.notify(invitee.id, 'campaignUpdates', {
        title: 'Campaign organiser invitation',
        message: `You've been invited to be an organiser on "${campaign.title}" as ${dto.role}.`,
        type: 'campaign',
        metadata: {
          kind: 'organizer_invitation',
          campaignId: campaign.id,
          campaignTitle: campaign.title,
          organizerId: saved.id,
          role: dto.role,
          pushToken: invitee.fcmToken,
        },
      });
    }

    return saved;
  }

  // Invitee-only. Flips a PENDING row to ACCEPTED and notifies the
  // creator. Idempotent if already accepted; rejects re-accepts of
  // previously-rejected invites.
  async accept(organizerId: string, requestUserId: string) {
    const organizer = await this.organizerRepo.findOne({
      where: { id: organizerId },
      relations: ['campaign', 'campaign.creator', 'user'],
    });
    if (!organizer) throw new NotFoundException('Invitation not found');
    if (organizer.userId !== requestUserId) {
      throw new ForbiddenException('This invitation is not for you');
    }
    if (organizer.invitationStatus === OrganizerInvitationStatus.ACCEPTED) {
      return organizer;
    }
    if (organizer.invitationStatus === OrganizerInvitationStatus.REJECTED) {
      throw new ConflictException(
        'You already rejected this invitation; ask the creator to re-invite',
      );
    }

    organizer.invitationStatus = OrganizerInvitationStatus.ACCEPTED;
    organizer.respondedAt = new Date();
    organizer.rejectionReason = null;
    const saved = await this.organizerRepo.save(organizer);

    const creator = organizer.campaign?.creator;
    if (creator) {
      await this.notificationService.notify(creator.id, 'campaignUpdates', {
        title: 'Organiser invitation accepted',
        message: `${organizer.displayName} accepted your invitation on "${organizer.campaign.title}".`,
        type: 'campaign',
        metadata: {
          kind: 'organizer_accepted',
          campaignId: organizer.campaignId,
          organizerId: organizer.id,
          pushToken: creator.fcmToken,
        },
      });
    }
    return saved;
  }

  // Invitee-only. Records optional reason and notifies the creator
  // with that reason so they see why the invite was declined.
  async reject(
    organizerId: string,
    requestUserId: string,
    reason?: string,
  ) {
    const organizer = await this.organizerRepo.findOne({
      where: { id: organizerId },
      relations: ['campaign', 'campaign.creator', 'user'],
    });
    if (!organizer) throw new NotFoundException('Invitation not found');
    if (organizer.userId !== requestUserId) {
      throw new ForbiddenException('This invitation is not for you');
    }
    if (organizer.invitationStatus === OrganizerInvitationStatus.REJECTED) {
      return organizer;
    }
    if (organizer.invitationStatus === OrganizerInvitationStatus.ACCEPTED) {
      throw new ConflictException(
        'You already accepted this invitation; ask the creator to remove you instead',
      );
    }

    organizer.invitationStatus = OrganizerInvitationStatus.REJECTED;
    organizer.respondedAt = new Date();
    organizer.rejectionReason = reason?.trim() || null;
    const saved = await this.organizerRepo.save(organizer);

    const creator = organizer.campaign?.creator;
    if (creator) {
      const reasonSuffix = organizer.rejectionReason
        ? `: "${organizer.rejectionReason}"`
        : ' (no reason provided)';
      await this.notificationService.notify(creator.id, 'campaignUpdates', {
        title: 'Organiser invitation declined',
        message: `${organizer.displayName} declined your invitation on "${organizer.campaign.title}"${reasonSuffix}.`,
        type: 'campaign',
        metadata: {
          kind: 'organizer_rejected',
          campaignId: organizer.campaignId,
          organizerId: organizer.id,
          rejectionReason: organizer.rejectionReason,
          pushToken: creator.fcmToken,
        },
      });
    }
    return saved;
  }

  // Invitee inbox — returns every PENDING invitation addressed to the
  // current user, joined with the campaign so the UI has enough to
  // render the invitation card.
  async listInvitations(userId: string) {
    return this.organizerRepo.find({
      where: {
        userId,
        invitationStatus: OrganizerInvitationStatus.PENDING,
      },
      relations: ['campaign', 'campaign.creator'],
      order: { createdAt: 'DESC' },
    });
  }

  async update(
    organizerId: string,
    requestUserId: string,
    dto: UpdateOrganizerDto,
  ) {
    const organizer = await this.organizerRepo.findOne({
      where: { id: organizerId },
      relations: ['campaign'],
    });
    if (!organizer) throw new NotFoundException('Organizer not found');
    if (organizer.campaign.creatorId !== requestUserId) {
      throw new ForbiddenException('Only the campaign creator can edit');
    }
    Object.assign(organizer, dto);
    return this.organizerRepo.save(organizer);
  }

  async remove(organizerId: string, requestUserId: string) {
    const organizer = await this.organizerRepo.findOne({
      where: { id: organizerId },
      relations: ['campaign'],
    });
    if (!organizer) throw new NotFoundException('Organizer not found');
    if (organizer.campaign.creatorId !== requestUserId) {
      throw new ForbiddenException('Only the campaign creator can remove');
    }
    await this.organizerRepo.remove(organizer);
    return { success: true };
  }

  async follow(organizerId: string, userId: string) {
    const organizer = await this.organizerRepo.findOne({
      where: { id: organizerId },
    });
    if (!organizer) throw new NotFoundException('Organizer not found');

    const existing = await this.followRepo.findOne({
      where: { organizerId, userId },
    });
    if (existing) throw new ConflictException('Already following');

    const follow = this.followRepo.create({ organizerId, userId });
    await this.followRepo.save(follow);
    return { success: true };
  }

  async unfollow(organizerId: string, userId: string) {
    const existing = await this.followRepo.findOne({
      where: { organizerId, userId },
    });
    if (!existing) throw new NotFoundException('Not following');
    await this.followRepo.remove(existing);
    return { success: true };
  }
}
