import {
  Injectable,
  Logger,
  OnModuleInit,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { PointsRule, UserPointsEvent } from '../entities';
import { SettingsService } from '../../settings/services/settings.service';

// Canonical action codes — kept in code as constants so the rest of the
// codebase imports them rather than typing strings. Admin can change
// the *value* of any rule at runtime by editing the points_rules row.
export const ACTION = {
  DONATION_DIRECT: 'donation.direct',
  DONATION_ON_BEHALF_PAYER: 'donation.on_behalf.payer',
  DONATION_ON_BEHALF_BENEFICIARY: 'donation.on_behalf.beneficiary',
  DONATION_VIA_CHAMPION_LINK: 'donation.via_champion_link',
  DONATION_SPLIT: 'donation.split',
} as const;

// Used to group ledger rows for the profile breakdown. Add new sections
// here as new surfaces start awarding points.
const SECTION_BY_PREFIX: Record<string, string> = {
  donation: 'donation',
  split_bill: 'split_bill',
  event: 'event',
  social: 'social',
};

function deriveSection(actionCode: string): string {
  const prefix = actionCode.split('.')[0] ?? '';
  return SECTION_BY_PREFIX[prefix] ?? prefix ?? 'other';
}

interface AwardInput {
  userId: string;
  actionCode: string;
  sourceType: string;
  sourceRefId: string;
  // Optional. If the rule is amount-scaled, the amount in *kobo* drives
  // the points calculation. Flat rules ignore this.
  amountInKobo?: number;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class PointsService implements OnModuleInit {
  private readonly logger = new Logger(PointsService.name);

  constructor(
    @InjectRepository(PointsRule)
    private readonly ruleRepo: Repository<PointsRule>,
    @InjectRepository(UserPointsEvent)
    private readonly eventRepo: Repository<UserPointsEvent>,
    private readonly settingsService: SettingsService,
  ) {}

  async onModuleInit() {
    // Best-effort. If migrations haven't run yet on a fresh deploy
    // the table won't exist; we must not crash bootstrap. The seed
    // is retried on every subsequent boot until it succeeds.
    try {
      await this.seedDefaultRules();
    } catch (err) {
      this.logger.warn(
        `seedDefaultRules skipped on boot: ${(err as Error).message}. ` +
          `Run migrations and restart to seed the defaults.`,
      );
    }
  }

  // Inserts the canonical default values once. Subsequent boots see
  // non-empty rules table and no-op, so admin edits stick.
  async seedDefaultRules(): Promise<void> {
    const count = await this.ruleRepo.count();
    if (count > 0) return;

    const defaults: Array<Partial<PointsRule>> = [
      {
        actionCode: ACTION.DONATION_DIRECT,
        points: 10,
        isActive: true,
        description: "Donor's points on a direct donation.",
      },
      {
        actionCode: ACTION.DONATION_ON_BEHALF_PAYER,
        points: 7,
        isActive: true,
        description:
          "Payer's points when donating on someone else's behalf (70% of direct).",
      },
      {
        actionCode: ACTION.DONATION_ON_BEHALF_BENEFICIARY,
        points: 3,
        isActive: true,
        description:
          "Beneficiary's points when a donation is made on their behalf (30% of direct).",
      },
      {
        actionCode: ACTION.DONATION_VIA_CHAMPION_LINK,
        points: 10,
        isActive: true,
        description:
          "Champion's points each time a donor uses their referral link.",
      },
      {
        actionCode: ACTION.DONATION_SPLIT,
        points: 10,
        isActive: true,
        description:
          "Splitter's points each time they pay a share of a donation-cause split bill.",
      },
    ];
    try {
      await this.ruleRepo.save(defaults);
      this.logger.log(
        `Seeded ${defaults.length} default GreyPoints rules.`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to seed default points rules: ${(err as Error).message}`,
      );
    }
  }

  // Writes one ledger row. No-op (and logs) if the rule is missing or
  // inactive — keeps the calling code free of try/catch for the happy
  // path where an admin has merely disabled a rule.
  async award(input: AwardInput): Promise<UserPointsEvent | null> {
    try {
      // Self-heal: if onModuleInit failed silently and the rules
      // table is still empty by the time the first award lands,
      // seed it lazily. Cheap because count() is fast and the
      // happy path is `if (count > 0) return`.
      await this.seedDefaultRules();

      const rule = await this.ruleRepo.findOne({
        where: { actionCode: input.actionCode },
      });
      if (!rule) {
        this.logger.warn(
          `award skipped: no rule for actionCode='${input.actionCode}' ` +
            `(user=${input.userId}, source=${input.sourceType}:${input.sourceRefId}).`,
        );
        return null;
      }
      if (!rule.isActive) {
        this.logger.log(
          `award skipped: rule '${input.actionCode}' is inactive.`,
        );
        return null;
      }

      let points = rule.points ?? 0;
      // ColumnNumericTransformer coerces NULL -> 0, so we can't use
      // `!= null` to tell flat-vs-scaled. Treat anything <= 0 as
      // "no multiplier, use flat points".
      if (
        rule.perKoboMultiplier != null &&
        Number.isFinite(rule.perKoboMultiplier) &&
        rule.perKoboMultiplier > 0 &&
        input.amountInKobo &&
        input.amountInKobo > 0
      ) {
        points = Math.round(rule.perKoboMultiplier * input.amountInKobo);
      }
      if (points <= 0) {
        this.logger.warn(
          `award skipped: computed points=${points} for ${input.actionCode} ` +
            `(rule.points=${rule.points}, perKoboMultiplier=${rule.perKoboMultiplier}).`,
        );
        return null;
      }

      const event = this.eventRepo.create({
        userId: input.userId,
        actionCode: input.actionCode,
        points,
        section: deriveSection(input.actionCode),
        sourceType: input.sourceType,
        sourceRefId: input.sourceRefId,
        metadata: input.metadata ?? null,
      });
      const saved = await this.eventRepo.save(event);
      this.logger.log(
        `Awarded ${points} pts '${input.actionCode}' to user=${input.userId} ` +
          `(source=${input.sourceType}:${input.sourceRefId}).`,
      );
      return saved;
    } catch (err) {
      // Awards must never block the user-facing action that triggered
      // them. Log and move on.
      this.logger.error(
        `award failed (${input.actionCode}, user=${input.userId}): ${(err as Error).message}`,
      );
      return null;
    }
  }

  // Reverses every active ledger row for a given source. Used by the
  // donation-refund flow so a refunded payment claws back all the
  // points it generated (donor, champion, on-behalf split).
  async reverse(
    sourceType: string,
    sourceRefId: string,
    reason?: string,
  ): Promise<number> {
    try {
      const rows = await this.eventRepo.find({
        where: { sourceType, sourceRefId, reversedAt: IsNull() },
      });
      if (rows.length === 0) return 0;
      const now = new Date();
      for (const row of rows) {
        row.reversedAt = now;
        row.reversalReason = reason ?? null;
      }
      await this.eventRepo.save(rows);
      return rows.length;
    } catch (err) {
      this.logger.error(
        `reverse failed (${sourceType}:${sourceRefId}): ${(err as Error).message}`,
      );
      return 0;
    }
  }

  // Sum of non-reversed points for one user.
  async getUserTotal(userId: string): Promise<number> {
    const raw = await this.eventRepo
      .createQueryBuilder('e')
      .select('COALESCE(SUM(e.points), 0)', 'total')
      .where('e.user_id = :userId', { userId })
      .andWhere('e.reversed_at IS NULL')
      .getRawOne<{ total: string }>();
    return Number(raw?.total ?? 0);
  }

  // Grouped breakdown for the profile card. Returns the grand total
  // plus per-section subtotals. Empty sections are omitted.
  async getUserBreakdown(
    userId: string,
  ): Promise<{
    total: number;
    sections: Array<{ section: string; total: number }>;
  }> {
    const rows = await this.eventRepo
      .createQueryBuilder('e')
      .select('e.section', 'section')
      .addSelect('COALESCE(SUM(e.points), 0)', 'total')
      .where('e.user_id = :userId', { userId })
      .andWhere('e.reversed_at IS NULL')
      .groupBy('e.section')
      .getRawMany<{ section: string; total: string }>();

    const sections = rows
      .map((r) => ({ section: r.section, total: Number(r.total) }))
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total);

    const total = sections.reduce((s, r) => s + r.total, 0);
    return { total, sections };
  }

  // Public view of another user's points. Respects the per-user
  // privacy toggle stored in Settings.privacyControls.showPointsPublicly.
  // Defaults to public when the toggle is unset.
  async getPublicBreakdown(
    targetUserId: string,
  ): Promise<{
    visible: boolean;
    total: number;
    sections: Array<{ section: string; total: number }>;
  }> {
    const visible = await this.isPublic(targetUserId);
    if (!visible) {
      return { visible: false, total: 0, sections: [] };
    }
    const breakdown = await this.getUserBreakdown(targetUserId);
    return { visible: true, ...breakdown };
  }

  private async isPublic(userId: string): Promise<boolean> {
    try {
      const settings = await this.settingsService.getSettings(userId);
      const privacy = (settings?.privacyControls ?? {}) as unknown as Record<
        string,
        unknown
      >;
      const flag = privacy['showPointsPublicly'];
      // Default = public when the toggle has never been set.
      if (flag === undefined || flag === null) return true;
      return Boolean(flag);
    } catch {
      return true;
    }
  }

  // Orchestrates every ledger row a single donation should produce:
  //   - donor.direct        — payer, when the donation isn't on-behalf
  //   - on_behalf.payer     — payer, when on-behalf of another GreyFundr user
  //   - on_behalf.beneficiary — that user
  //   - via_champion_link   — champion (resolved from referrer amplifier),
  //                           skipped if the champion *is* the payer to
  //                           prevent self-referral farming.
  //
  // All rows are written with sourceType='donation' + sourceRefId=donation.id
  // so reverse() can claw back the entire bundle on refund in one call.
  async awardForDonation(args: {
    payerId: string;
    donation: {
      id: string;
      campaignId: string;
      amount: number;
      onBehalfOf?: string | null;
      onBehalfOfUserId?: string | null;
    };
    championUserId?: string | null;
  }): Promise<void> {
    const { payerId, donation, championUserId } = args;
    if (!payerId || !donation?.id) return;

    const isOnBehalfUser =
      donation.onBehalfOf === 'user' && !!donation.onBehalfOfUserId;
    const amountInKobo = Math.round(Number(donation.amount ?? 0) * 100);
    const baseMeta = {
      campaignId: donation.campaignId,
      donationAmount: donation.amount,
    };

    if (isOnBehalfUser) {
      await this.award({
        userId: payerId,
        actionCode: ACTION.DONATION_ON_BEHALF_PAYER,
        sourceType: 'donation',
        sourceRefId: donation.id,
        amountInKobo,
        metadata: { ...baseMeta, beneficiaryId: donation.onBehalfOfUserId },
      });
      if (donation.onBehalfOfUserId) {
        await this.award({
          userId: donation.onBehalfOfUserId,
          actionCode: ACTION.DONATION_ON_BEHALF_BENEFICIARY,
          sourceType: 'donation',
          sourceRefId: donation.id,
          amountInKobo,
          metadata: { ...baseMeta, payerId },
        });
      }
    } else {
      await this.award({
        userId: payerId,
        actionCode: ACTION.DONATION_DIRECT,
        sourceType: 'donation',
        sourceRefId: donation.id,
        amountInKobo,
        metadata: baseMeta,
      });
    }

    if (championUserId && championUserId !== payerId) {
      await this.award({
        userId: championUserId,
        actionCode: ACTION.DONATION_VIA_CHAMPION_LINK,
        sourceType: 'donation',
        sourceRefId: donation.id,
        amountInKobo,
        metadata: { ...baseMeta, payerId },
      });
    }
  }

  // Convenience for the split-bill-on-donation-cause path. The
  // `paymentRef` (gateway reference / transaction id) must be unique
  // per payment so partial-then-full and re-pay flows each get their
  // own ledger row — and a refund can reverse precisely that payment.
  async awardForSplitBillDonation(args: {
    payerId: string;
    splitBillId: string;
    campaignId: string;
    amountPaid: number;
    paymentRef: string;
  }): Promise<void> {
    if (!args.payerId || !args.paymentRef) return;
    await this.award({
      userId: args.payerId,
      actionCode: ACTION.DONATION_SPLIT,
      sourceType: 'split_bill_donation',
      sourceRefId: args.paymentRef,
      amountInKobo: Math.round(Number(args.amountPaid ?? 0) * 100),
      metadata: {
        splitBillId: args.splitBillId,
        campaignId: args.campaignId,
        amountPaid: args.amountPaid,
      },
    });
  }

  /* ---------- admin helpers (no controller yet) ---------- */

  async listRules(): Promise<PointsRule[]> {
    return this.ruleRepo.find({ order: { actionCode: 'ASC' } });
  }

  async setRule(
    actionCode: string,
    patch: Partial<Pick<PointsRule, 'points' | 'perKoboMultiplier' | 'isActive' | 'description'>>,
  ): Promise<PointsRule> {
    const existing = await this.ruleRepo.findOne({ where: { actionCode } });
    if (!existing) {
      throw new NotFoundException(
        `Points rule '${actionCode}' does not exist`,
      );
    }
    Object.assign(existing, patch);
    return this.ruleRepo.save(existing);
  }
}
