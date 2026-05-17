import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SplitBill,
  SplitBillActivity,
  SplitBillParticipant,
  SplitBillUpdate,
} from '../entities';
import { User } from '../../user/entities';
import {
  CreateSplitBillUpdateDto,
  SplitBillUpdateResponseDto,
} from '../dtos/split-bill-update.dto';
import { ActivityActionType } from '../enums/split-bill.enum';
import { NotificationService } from '../../notification/services/notification.service';

// Creator-only "announcements" feed for a split bill. Mirrors the
// campaign Updates service. Participants can read but not post —
// they raise their voice through Comments / Governance instead.
@Injectable()
export class SplitBillUpdateService {
  constructor(
    @InjectRepository(SplitBillUpdate)
    private readonly updateRepo: Repository<SplitBillUpdate>,
    @InjectRepository(SplitBill)
    private readonly billRepo: Repository<SplitBill>,
    @InjectRepository(SplitBillParticipant)
    private readonly participantRepo: Repository<SplitBillParticipant>,
    @InjectRepository(SplitBillActivity)
    private readonly activityRepo: Repository<SplitBillActivity>,
    private readonly notifications: NotificationService,
  ) {}

  async list(billId: string): Promise<SplitBillUpdateResponseDto[]> {
    const rows = await this.updateRepo.find({
      where: { splitBillId: billId },
      relations: ['author'],
      order: { pinned: 'DESC', createdAt: 'DESC' },
    });
    return rows.map((u) => this.toDto(u));
  }

  async create(
    billId: string,
    user: User,
    dto: CreateSplitBillUpdateDto,
  ): Promise<SplitBillUpdateResponseDto> {
    const bill = await this.billRepo.findOne({ where: { id: billId } });
    if (!bill) throw new NotFoundException('Bill not found');
    if (bill.creatorId !== user.id) {
      throw new ForbiddenException(
        'Only the bill creator can post an update',
      );
    }
    const saved = await this.updateRepo.save(
      this.updateRepo.create({
        splitBillId: billId,
        authorId: user.id,
        body: dto.body.trim(),
        pinned: dto.pinned ?? false,
      }),
    );
    const withAuthor = await this.updateRepo.findOne({
      where: { id: saved.id },
      relations: ['author'],
    });

    // Activity log + notify every participant on the bill.
    await this.activityRepo.save({
      splitBillId: billId,
      actorId: user.id,
      actionType: ActivityActionType.UPDATE_POSTED,
      description: 'Posted a new update',
    });
    const parts = await this.participantRepo.find({
      where: { splitBillId: billId },
    });
    const targets = new Set<string>();
    for (const p of parts) {
      if (!p.userId || p.userId === user.id) continue;
      targets.add(p.userId);
    }
    for (const uid of targets) {
      try {
        await this.notifications.notify(uid, 'billReminders', {
          title: 'New update on your bill',
          message: dto.body.trim().length > 100
            ? `${dto.body.trim().substring(0, 100)}…`
            : dto.body.trim(),
          type: 'split_bill',
          metadata: { billId, kind: 'update_posted', updateId: saved.id },
        });
      } catch (_err) {
        // Don't let one bad recipient kill the rest of the fanout.
      }
    }

    return this.toDto(withAuthor as SplitBillUpdate);
  }

  private toDto(u: SplitBillUpdate): SplitBillUpdateResponseDto {
    const a = u.author;
    return {
      id: u.id,
      splitBillId: u.splitBillId,
      body: u.body,
      pinned: !!u.pinned,
      createdAt: u.createdAt,
      author: {
        id: a?.id ?? u.authorId,
        firstName: a?.firstName ?? undefined,
        lastName: a?.lastName ?? undefined,
        profileImage: (a as { profile?: { image?: string } })?.profile?.image,
      },
    };
  }
}
