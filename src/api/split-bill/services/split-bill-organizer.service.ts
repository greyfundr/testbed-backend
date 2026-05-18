import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SplitBill } from '../entities/split-bill.entity';
import {
  SplitBillOrganizer,
  SplitBillOrganizerInvitationStatus,
} from '../entities/split-bill-organizer.entity';
import { User } from '../../user/entities';
import { NotificationService } from '../../notification/services/notification.service';
import {
  CreateSplitBillOrganizerDto,
  UpdateSplitBillOrganizerDto,
} from '../dto/split-bill-organizer.dto';

// Mirrors `CampaignOrganizerService` so the split-bill UX matches:
// the creator invites a user → invitee gets a notification → invitee
// accepts (row becomes ACCEPTED + appears in the public rail) or
// declines (row stays as REJECTED for audit). Free-form rows (no
// linked userId) skip the invite step and land ACCEPTED on create.
@Injectable()
export class SplitBillOrganizerService {
  constructor(
    @InjectRepository(SplitBillOrganizer)
    private readonly organizerRepo: Repository<SplitBillOrganizer>,
    @InjectRepository(SplitBill)
    private readonly billRepo: Repository<SplitBill>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly notificationService: NotificationService,
  ) {}

  // Creator-only variant: returns every row on the bill regardless
  // of status so the Manage Organisers sheet can render PENDING /
  // DECLINED invitations the creator has sent. Throws if the caller
  // isn't the creator so we don't leak invite state.
  async listForCreator(splitBillId: string, requestUserId: string) {
    const bill = await this.billRepo.findOne({ where: { id: splitBillId } });
    if (!bill) throw new NotFoundException('Split bill not found');
    if (bill.creatorId !== requestUserId) {
      throw new ForbiddenException(
        'Only the bill creator can see pending invitations',
      );
    }
    return this.organizerRepo.find({
      where: { splitBillId },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
  }

  // Public rail surfaces only ACCEPTED organisers — pending and
  // rejected stay backend-side so participants don't see invitee
  // status leaks.
  async list(splitBillId: string) {
    return this.organizerRepo.find({
      where: {
        splitBillId,
        invitationStatus: SplitBillOrganizerInvitationStatus.ACCEPTED,
      },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
  }

  async create(
    splitBillId: string,
    creatorId: string,
    dto: CreateSplitBillOrganizerDto,
  ) {
    const bill = await this.billRepo.findOne({ where: { id: splitBillId } });
    if (!bill) throw new NotFoundException('Split bill not found');
    if (bill.creatorId !== creatorId) {
      throw new ForbiddenException(
        'Only the bill creator can add organisers',
      );
    }

    // When userId is supplied, treat as an invitation: PENDING, send a
    // notification, and only surface on the public rail after accept.
    // Free-form rows (name-only) auto-accept — no inbox to wait on.
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
        where: { splitBillId, userId: invitee.id },
      });
      if (existing) {
        throw new ConflictException(
          existing.invitationStatus ===
            SplitBillOrganizerInvitationStatus.PENDING
            ? 'This user already has a pending invitation'
            : existing.invitationStatus ===
                SplitBillOrganizerInvitationStatus.ACCEPTED
              ? 'This user is already an organiser'
              : 'This user previously declined an invitation',
        );
      }
    }

    const status = invitee
      ? SplitBillOrganizerInvitationStatus.PENDING
      : SplitBillOrganizerInvitationStatus.ACCEPTED;

    const role = (dto.role ?? 'Organiser').trim() || 'Organiser';

    const organizer = this.organizerRepo.create({
      splitBillId,
      userId: dto.userId ?? null,
      displayName: dto.displayName,
      role,
      avatarUrl: dto.avatarUrl ?? null,
      invitationStatus: status,
    });
    const saved = await this.organizerRepo.save(organizer);

    if (invitee) {
      const title = 'Split bill organiser invitation';
      const message = `You've been invited to help run "${bill.title}" as ${role}.`;
      // Provide an HTML body so the mailtrap branch of notify() fires
      // an email — without this metadata.emailHtml the invitee only
      // gets in-app + push + WhatsApp, no email at all.
      const emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2937;">
          <h2 style="color: #017981; margin: 0 0 12px;">Organiser invitation</h2>
          <p style="margin: 0 0 16px; line-height: 1.5;">${message}</p>
          <p style="margin: 0 0 16px; line-height: 1.5;">Open the GreyFundr app to accept or decline this invitation. Once accepted, you'll be able to help manage participants, post updates, and review proposals on this bill.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="font-size: 12px; color: #6b7280; margin: 0;">If you weren't expecting this invitation, you can safely ignore this email.</p>
        </div>
      `;
      await this.notificationService.notify(invitee.id, 'billReminders', {
        title,
        message,
        type: 'split_bill',
        metadata: {
          kind: 'split_bill_organizer_invitation',
          splitBillId: bill.id,
          splitBillTitle: bill.title,
          organizerId: saved.id,
          role,
          pushToken: invitee.fcmToken,
          phoneNumber: invitee.phoneNumber,
          email: invitee.email,
          emailHtml,
        },
      });
    }

    return saved;
  }

  // Invitee-only. Flips PENDING → ACCEPTED and notifies the creator.
  // Idempotent on re-accept; rejects re-accepting a previously-declined
  // invite (the creator should re-invite instead).
  async accept(organizerId: string, requestUserId: string) {
    const organizer = await this.organizerRepo.findOne({
      where: { id: organizerId },
      relations: ['splitBill', 'splitBill.creator', 'user'],
    });
    if (!organizer) throw new NotFoundException('Invitation not found');
    if (organizer.userId !== requestUserId) {
      throw new ForbiddenException('This invitation is not for you');
    }
    if (
      organizer.invitationStatus ===
      SplitBillOrganizerInvitationStatus.ACCEPTED
    ) {
      return organizer;
    }
    if (
      organizer.invitationStatus ===
      SplitBillOrganizerInvitationStatus.REJECTED
    ) {
      throw new ConflictException(
        'You already declined this invitation; ask the creator to re-invite',
      );
    }

    organizer.invitationStatus = SplitBillOrganizerInvitationStatus.ACCEPTED;
    organizer.respondedAt = new Date();
    organizer.rejectionReason = null;
    const saved = await this.organizerRepo.save(organizer);

    const creator = organizer.splitBill?.creator;
    if (creator) {
      await this.notificationService.notify(creator.id, 'billReminders', {
        title: 'Organiser invitation accepted',
        message: `${organizer.displayName} accepted your invitation on "${organizer.splitBill.title}".`,
        type: 'split_bill',
        metadata: {
          kind: 'split_bill_organizer_accepted',
          splitBillId: organizer.splitBillId,
          organizerId: organizer.id,
          pushToken: creator.fcmToken,
        },
      });
    }
    return saved;
  }

  async reject(
    organizerId: string,
    requestUserId: string,
    reason?: string,
  ) {
    const organizer = await this.organizerRepo.findOne({
      where: { id: organizerId },
      relations: ['splitBill', 'splitBill.creator', 'user'],
    });
    if (!organizer) throw new NotFoundException('Invitation not found');
    if (organizer.userId !== requestUserId) {
      throw new ForbiddenException('This invitation is not for you');
    }
    if (
      organizer.invitationStatus ===
      SplitBillOrganizerInvitationStatus.REJECTED
    ) {
      return organizer;
    }
    if (
      organizer.invitationStatus ===
      SplitBillOrganizerInvitationStatus.ACCEPTED
    ) {
      throw new ConflictException(
        'You already accepted this invitation; ask the creator to remove you instead',
      );
    }

    organizer.invitationStatus = SplitBillOrganizerInvitationStatus.REJECTED;
    organizer.respondedAt = new Date();
    organizer.rejectionReason = reason?.trim() || null;
    const saved = await this.organizerRepo.save(organizer);

    const creator = organizer.splitBill?.creator;
    if (creator) {
      const reasonSuffix = organizer.rejectionReason
        ? `: "${organizer.rejectionReason}"`
        : ' (no reason provided)';
      await this.notificationService.notify(creator.id, 'billReminders', {
        title: 'Organiser invitation declined',
        message: `${organizer.displayName} declined your invitation on "${organizer.splitBill.title}"${reasonSuffix}.`,
        type: 'split_bill',
        metadata: {
          kind: 'split_bill_organizer_rejected',
          splitBillId: organizer.splitBillId,
          organizerId: organizer.id,
          rejectionReason: organizer.rejectionReason,
          pushToken: creator.fcmToken,
        },
      });
    }
    return saved;
  }

  // Invitee inbox — every PENDING row addressed to the current user.
  async listInvitations(userId: string) {
    return this.organizerRepo.find({
      where: {
        userId,
        invitationStatus: SplitBillOrganizerInvitationStatus.PENDING,
      },
      relations: ['splitBill', 'splitBill.creator'],
      order: { createdAt: 'DESC' },
    });
  }

  async update(
    organizerId: string,
    requestUserId: string,
    dto: UpdateSplitBillOrganizerDto,
  ) {
    const organizer = await this.organizerRepo.findOne({
      where: { id: organizerId },
      relations: ['splitBill'],
    });
    if (!organizer) throw new NotFoundException('Organiser not found');
    if (organizer.splitBill.creatorId !== requestUserId) {
      throw new ForbiddenException('Only the bill creator can edit');
    }
    Object.assign(organizer, dto);
    return this.organizerRepo.save(organizer);
  }

  async remove(organizerId: string, requestUserId: string) {
    const organizer = await this.organizerRepo.findOne({
      where: { id: organizerId },
      relations: ['splitBill'],
    });
    if (!organizer) throw new NotFoundException('Organiser not found');
    if (organizer.splitBill.creatorId !== requestUserId) {
      throw new ForbiddenException('Only the bill creator can remove');
    }
    await this.organizerRepo.remove(organizer);
    return { success: true };
  }
}
