import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  Between,
  LessThan,
  In,
  LessThanOrEqual,
} from 'typeorm';
import { SplitBill } from '../entities';
import { SplitBillParticipant } from '../entities';
import { SplitBillStatus, ParticipantStatus } from '../enums';
import { User } from '../../user/entities';
import { NotificationService } from '../../notification/services/notification.service';

// Daily cron that nudges bill creators + unpaid participants when a
// bill's `dueDate` is approaching, on the due date itself, and for
// the first few days it slips into overdue.
//
// Cadence rules:
//   - 1 reminder per bill per UTC day.
//   - Fires the day BEFORE due ("due tomorrow"), ON the due date
//     ("due today"), and then once a day for the next 3 days of
//     overdue ("N days overdue"). After that we stop bumping so
//     participants don't get spammed indefinitely.
//   - Re-occurring bills follow the exact same gate. When the
//     auto-advance feature ships, the dueDate will already point at
//     the next cycle so this cron keeps working without changes.
@Injectable()
export class SplitBillDueReminderService {
  private readonly logger = new Logger(SplitBillDueReminderService.name);
  private static readonly OVERDUE_REMINDER_WINDOW_DAYS = 3;

  constructor(
    @InjectRepository(SplitBill)
    private readonly billRepo: Repository<SplitBill>,
    @InjectRepository(SplitBillParticipant)
    private readonly participantRepo: Repository<SplitBillParticipant>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly notificationService: NotificationService,
  ) {}

  // 9 AM Africa/Lagos sits within the morning window for both NG and
  // most of the user base. `EVERY_DAY_AT_9AM` runs in the server's
  // TZ — Render reports UTC, so this fires at 9 AM UTC. Adjust the
  // expression once we have a per-user timezone setting.
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async sweepDueBills(): Promise<void> {
    try {
      const now = new Date();
      const dayMs = 24 * 60 * 60 * 1000;
      const tomorrowEnd = new Date(now.getTime() + dayMs);
      // Floor = "earliest we'd ever send a reminder for" = 3 days
      // before the start of today.
      const overdueFloor = new Date(
        now.getTime() -
          SplitBillDueReminderService.OVERDUE_REMINDER_WINDOW_DAYS * dayMs,
      );
      // Don't re-fire if we already nudged within the last 20 hours —
      // covers cron retries + slightly-drifted run times without
      // dropping the next genuine daily reminder.
      const recentReminderCutoff = new Date(now.getTime() - 20 * 60 * 60 * 1000);

      const candidates = await this.billRepo.find({
        where: {
          status: In([
            SplitBillStatus.ACTIVE,
            SplitBillStatus.PARTIALLY_PAID,
            SplitBillStatus.OVERDUE,
          ]),
          dueDate: Between(overdueFloor, tomorrowEnd),
        },
        relations: ['creator', 'participants', 'participants.user'],
      });

      if (candidates.length === 0) return;

      let nudged = 0;
      for (const bill of candidates) {
        if (
          bill.lastReminderAt &&
          bill.lastReminderAt > recentReminderCutoff
        ) {
          continue;
        }
        try {
          await this._notifyBill(bill, now);
          await this.billRepo.update(bill.id, {
            lastReminderAt: now,
            reminderSentCount: (bill.reminderSentCount ?? 0) + 1,
          });
          nudged += 1;
        } catch (err) {
          this.logger.warn(
            `[DueReminder ${bill.id}] notify failed: ${(err as Error)?.message}`,
          );
        }
      }
      if (nudged > 0) {
        this.logger.log(
          `[DueReminder] Nudged ${nudged}/${candidates.length} bill(s).`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Due-reminder sweep failed: ${(err as Error)?.message}`,
        (err as Error)?.stack,
      );
    }
  }

  // Composes the headline based on dueDate vs now and fans out:
  //   1) one notification to the bill creator
  //   2) one per unpaid participant (only those with a linked userId —
  //      guests live on phone-only and would need separate SMS/WhatsApp
  //      hooks, which are out of scope for this v1).
  private async _notifyBill(bill: SplitBill, now: Date): Promise<void> {
    if (!bill.dueDate) return;
    const due = bill.dueDate;
    const dayMs = 24 * 60 * 60 * 1000;
    const diffDays = Math.floor((due.getTime() - now.getTime()) / dayMs);

    let creatorHeadline: string;
    let participantHeadline: (amountOwed: string) => string;
    if (diffDays >= 1) {
      creatorHeadline = `"${bill.title}" is due tomorrow`;
      participantHeadline = (a) =>
        `You owe ${a} on "${bill.title}" — due tomorrow`;
    } else if (diffDays === 0) {
      creatorHeadline = `"${bill.title}" is due today`;
      participantHeadline = (a) =>
        `You owe ${a} on "${bill.title}" — due today`;
    } else {
      const overdueDays = Math.abs(diffDays);
      creatorHeadline =
        `"${bill.title}" is ${overdueDays} day${overdueDays === 1 ? '' : 's'} overdue`;
      participantHeadline = (a) =>
        `${a} still outstanding on "${bill.title}" — ${overdueDays} day${overdueDays === 1 ? '' : 's'} overdue`;
    }

    // ─── Creator notification ────────────────────────────────
    if (bill.creatorId) {
      const creator = bill.creator;
      const unpaidCount = (bill.participants ?? []).filter(
        (p) =>
          p.status !== ParticipantStatus.PAID &&
          p.status !== ParticipantStatus.DECLINED &&
          p.status !== ParticipantStatus.WAIVED,
      ).length;
      const subtitle = unpaidCount > 0
        ? `${unpaidCount} participant${unpaidCount === 1 ? '' : 's'} still owe their share.`
        : 'Everyone has paid — you can finalise.';
      await this.notificationService
        .notify(bill.creatorId, 'billReminders', {
          title: creatorHeadline,
          message: subtitle,
          type: 'split_bill',
          metadata: {
            kind: 'split_bill_due_reminder',
            billId: bill.id,
            billTitle: bill.title,
            dueDate: bill.dueDate.toISOString(),
            recurrenceFrequency: bill.recurrenceFrequency,
            pushToken: creator?.fcmToken,
          },
        })
        .catch((err) =>
          this.logger.warn(
            `[DueReminder ${bill.id}] creator notify failed: ${(err as Error)?.message}`,
          ),
        );
    }

    // ─── Participant fan-out ──────────────────────────────────
    const unpaid = (bill.participants ?? []).filter(
      (p) =>
        p.userId &&
        p.status !== ParticipantStatus.PAID &&
        p.status !== ParticipantStatus.DECLINED &&
        p.status !== ParticipantStatus.WAIVED,
    );
    for (const p of unpaid) {
      const remaining = Math.max(
        0,
        Number(p.amountRemaining ?? p.amountOwed ?? 0),
      );
      if (remaining <= 0) continue;
      const formatted = new Intl.NumberFormat('en-NG', {
        maximumFractionDigits: 0,
      }).format(remaining);
      const amount = `₦${formatted}`;
      await this.notificationService
        .notify(p.userId!, 'billReminders', {
          title: participantHeadline(amount),
          message: 'Tap to settle your share or message the creator.',
          type: 'split_bill',
          metadata: {
            kind: 'split_bill_due_reminder',
            billId: bill.id,
            billTitle: bill.title,
            dueDate: bill.dueDate.toISOString(),
            participantId: p.id,
            amountRemaining: remaining,
            recurrenceFrequency: bill.recurrenceFrequency,
            pushToken: p.user?.fcmToken,
          },
        })
        .catch((err) =>
          this.logger.warn(
            `[DueReminder ${bill.id}] participant ${p.id} notify failed: ${(err as Error)?.message}`,
          ),
        );
    }

    // Silence the unused-import lint when the cron file is the only
    // place LessThan / LessThanOrEqual live. The helpers are kept for
    // future cadence work (e.g. cycle-end auto-advance scans).
    void LessThan;
    void LessThanOrEqual;
  }
}
