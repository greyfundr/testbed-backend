import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  Campaign,
  CampaignLike,
  CampaignSave,
  CampaignComment,
  CampaignAmplifier,
  CampaignView,
  Donation,
  UserInterestProfile,
} from '../entities';

// Per-engagement-type weight multipliers applied when we add the
// engaged-with campaign's tags into the user's interest profile.
// Donations dominate — actual money is the strongest signal of
// interest. Champion-ing is even higher because it's both money and
// social commitment. Views are weak because anyone scrolling a feed
// taps a few cards out of curiosity.
const SIGNAL_WEIGHTS = {
  donation: 5,
  amplifier: 6,
  save: 3,
  comment: 2,
  like: 2,
  view: 0.5,
} as const;

// Half-life in days for exponential decay on engagement age. After
// HALF_LIFE_DAYS the contribution of a signal is halved. Tuned to
// 90 days so a "donated last quarter" still carries weight but a
// 2-year-old donation drops to ~5%.
const HALF_LIFE_DAYS = 90;

@Injectable()
export class UserInterestProfileService {
  private readonly logger = new Logger(UserInterestProfileService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(UserInterestProfile)
    private readonly profileRepo: Repository<UserInterestProfile>,
    @InjectRepository(Donation)
    private readonly donationRepo: Repository<Donation>,
    @InjectRepository(CampaignLike)
    private readonly likeRepo: Repository<CampaignLike>,
    @InjectRepository(CampaignSave)
    private readonly saveRepo: Repository<CampaignSave>,
    @InjectRepository(CampaignComment)
    private readonly commentRepo: Repository<CampaignComment>,
    @InjectRepository(CampaignAmplifier)
    private readonly amplifierRepo: Repository<CampaignAmplifier>,
    @InjectRepository(CampaignView)
    private readonly viewRepo: Repository<CampaignView>,
    @InjectRepository(Campaign)
    private readonly campaignRepo: Repository<Campaign>,
  ) {}

  // Rebuild the user's interest vector from scratch by summing
  // weighted tag contributions across every engagement. Done as a
  // full rebuild (rather than incremental ±) for simplicity and
  // correctness — the underlying joins are cheap for a single user
  // and we only rebuild on actual engagement events, not on every
  // feed request.
  async rebuildForUser(userId: string): Promise<UserInterestProfile> {
    const tagScores: Record<string, number> = {};
    let lastEventAt: Date | null = null;

    // Helper — adds a campaign's tag list into `tagScores` weighted
    // by the signal × time decay. Skips campaigns that have no
    // tags yet (legacy / not-backfilled rows).
    const addCampaignSignal = (
      tags: string[] | null | undefined,
      weight: number,
      eventAt: Date,
    ) => {
      if (!tags || tags.length === 0) return;
      const ageDays =
        (Date.now() - eventAt.getTime()) / (1000 * 60 * 60 * 24);
      const decay = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
      const contribution = weight * decay;
      for (const tag of tags) {
        tagScores[tag] = (tagScores[tag] ?? 0) + contribution;
      }
      if (!lastEventAt || eventAt > lastEventAt) lastEventAt = eventAt;
    };

    // Donations. amount-weighted on top of the base signal: a
    // ₦100,000 donation tells us 10x what a ₦10,000 donation does.
    // Capped at 5x so a single whale donation doesn't crowd out the
    // user's other interests.
    const donations = await this.donationRepo.find({
      where: { donorId: userId },
      relations: ['campaign'],
      take: 200,
      order: { createdAt: 'DESC' },
    });
    for (const d of donations) {
      if (!d.campaign) continue;
      const amountBoost = Math.min(5, 1 + Number(d.amount) / 20000);
      addCampaignSignal(
        d.campaign.tags,
        SIGNAL_WEIGHTS.donation * amountBoost,
        d.createdAt,
      );
    }

    // Other engagements — read each table once, join to the
    // campaign's tags via a manual lookup so we don't have to
    // declare a relations array per row type. take(200) on each
    // keeps the rebuild bounded even for power users.
    const [amps, saves, comments, likes, views] = await Promise.all([
      this.amplifierRepo.find({
        where: { userId },
        relations: ['campaign'],
        take: 200,
        order: { createdAt: 'DESC' },
      }),
      this.saveRepo.find({
        where: { userId },
        relations: ['campaign'],
        take: 200,
        order: { createdAt: 'DESC' },
      }),
      this.commentRepo.find({
        where: { userId },
        relations: ['campaign'],
        take: 200,
        order: { createdAt: 'DESC' },
      }),
      this.likeRepo.find({
        where: { userId },
        relations: ['campaign'],
        take: 200,
        order: { createdAt: 'DESC' },
      }),
      this.viewRepo.find({
        where: { userId },
        relations: ['campaign'],
        take: 200,
        order: { viewedAt: 'DESC' },
      }),
    ]);

    for (const a of amps)
      addCampaignSignal(a.campaign?.tags, SIGNAL_WEIGHTS.amplifier, a.createdAt);
    for (const s of saves)
      addCampaignSignal(s.campaign?.tags, SIGNAL_WEIGHTS.save, s.createdAt);
    for (const c of comments)
      addCampaignSignal(c.campaign?.tags, SIGNAL_WEIGHTS.comment, c.createdAt);
    for (const l of likes)
      addCampaignSignal(l.campaign?.tags, SIGNAL_WEIGHTS.like, l.createdAt);
    for (const v of views) {
      // Dwell-time uplift — campaigns the user actually read for
      // 10s+ count as a stronger interest signal than instant
      // bounce-aways. Clamped so a 60-minute background-tab idle
      // doesn't pretend the user was deeply engaged.
      const dwellBoost =
        v.dwellMs != null
          ? Math.min(3, 1 + v.dwellMs / 30000)
          : 1;
      addCampaignSignal(
        v.campaign?.tags,
        SIGNAL_WEIGHTS.view * dwellBoost,
        v.viewedAt,
      );
    }

    // Normalize so the heaviest tag is 1.0 — keeps the cosine
    // similarity calculation in the feed scoring well-conditioned
    // and lets us compare profiles across users (a casual donor's
    // top tag is "1.0" just like a power donor's).
    const maxScore = Math.max(0, ...Object.values(tagScores));
    const normalized: Record<string, number> = {};
    if (maxScore > 0) {
      for (const [tag, score] of Object.entries(tagScores)) {
        normalized[tag] = +(score / maxScore).toFixed(4);
      }
    }

    const existing = await this.profileRepo.findOne({ where: { userId } });
    if (existing) {
      existing.tagWeights = normalized;
      existing.lastEventAt = lastEventAt;
      return this.profileRepo.save(existing);
    }
    return this.profileRepo.save(
      this.profileRepo.create({
        userId,
        tagWeights: normalized,
        lastEventAt,
      }),
    );
  }

  // Read-only lookup used by the feed. Returns an empty map for
  // users with no profile row (which the feed treats as "cold start
  // → fall back to trending").
  async getProfile(userId: string): Promise<Record<string, number>> {
    const row = await this.profileRepo.findOne({ where: { userId } });
    return row?.tagWeights ?? {};
  }

  // Rebuild the profile if it doesn't exist or hasn't been updated
  // within `maxAgeMs`. Called from CampaignFeedService before each
  // feed read so engagement events are picked up without us having
  // to instrument every site that mutates a like / save / donation
  // / comment / amplifier row.
  async refreshIfStale(userId: string, maxAgeMs: number): Promise<void> {
    const existing = await this.profileRepo.findOne({ where: { userId } });
    if (!existing) {
      await this.rebuildForUser(userId);
      return;
    }
    const ageMs = Date.now() - existing.updatedAt.getTime();
    if (ageMs >= maxAgeMs) {
      await this.rebuildForUser(userId);
    }
  }
}
