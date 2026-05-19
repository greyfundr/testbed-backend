import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Campaign, CampaignView, Donation } from '../entities';
import { CampaignStatus } from '../enums/campaign.enum';
import { User } from '../../user/entities/user.entity';
import { UserInterestProfileService } from './user-interest-profile.service';

// Score weights for the final For You ranking. Tuned so personal
// content match dominates once we have signal, freshness keeps
// brand-new campaigns from being invisible, and trending boosts
// what other donors are reacting to right now. Locality is a small
// nudge — useful in NG where donors often prefer to back campaigns
// in their state but rarely as a hard filter.
const SCORE_WEIGHTS = {
  content: 0.60,
  freshness: 0.20,
  trending: 0.15,
  locality: 0.05,
} as const;

const FRESHNESS_HALF_LIFE_DAYS = 30;
const TRENDING_WINDOW_HOURS = 48;

@Injectable()
export class CampaignFeedService {
  private readonly logger = new Logger(CampaignFeedService.name);

  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepo: Repository<Campaign>,
    @InjectRepository(CampaignView)
    private readonly viewRepo: Repository<CampaignView>,
    @InjectRepository(Donation)
    private readonly donationRepo: Repository<Donation>,
    private readonly profileService: UserInterestProfileService,
  ) {}

  // Main entrypoint. Returns the ranked campaign list for the For
  // You feed, optionally paginated by cursor. Cursor is the score
  // of the last item the client received — we return campaigns with
  // score < cursor in descending score order.
  async getForYouFeed(
    user: User,
    opts: { limit?: number; cursor?: number } = {},
  ): Promise<{
    items: Array<Campaign & { _feedScore: number; _reason: string }>;
    nextCursor: number | null;
  }> {
    const limit = Math.min(opts.limit ?? 20, 50);

    // Lazily refresh the interest profile if it's stale (or missing).
    // 15-minute cache window — long enough that the feed-page-open
    // call is usually a cheap lookup, short enough that a donation
    // the user just made is reflected the next time they pull-to-
    // refresh. Avoids having to instrument every engagement site
    // (donation / like / save / comment / amplifier signup) to push
    // signal — the next feed request closes the loop.
    await this.profileService.refreshIfStale(user.id, 15 * 60 * 1000);
    const userTags = await this.profileService.getProfile(user.id);
    const hasProfile = Object.keys(userTags).length > 0;

    // Candidate pool — every campaign visible to the public Explore
    // feed. Matches CampaignService.getAll's status filter (ACTIVE +
    // PENDING_APPROVAL) so the For You tab can never show LESS than
    // Explore for the same user. We deliberately don't exclude the
    // user's own campaigns or campaigns they've already donated to;
    // instead we DOWN-RANK them in the score so the feed always has
    // content even for power users / testbed users who created or
    // donated to most of the pool.
    const candidates = await this.campaignRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.creator', 'creator')
      .leftJoinAndSelect('c.category', 'category')
      .where('c.status IN (:...statuses)', {
        statuses: [CampaignStatus.ACTIVE, CampaignStatus.PENDING_APPROVAL],
      })
      .orderBy('c.createdAt', 'DESC')
      .limit(200)
      .getMany();

    this.logger.log(
      `getForYouFeed user=${user.id} candidates=${candidates.length} hasProfile=${hasProfile}`,
    );

    if (candidates.length === 0) {
      this.logger.warn(
        `getForYouFeed: zero candidates for user=${user.id}. ` +
          `Check campaign.status values in DB — feed accepts ACTIVE + PENDING_APPROVAL.`,
      );
      return { items: [], nextCursor: null };
    }

    // Bulk-load engagement counts for the candidate pool so each
    // per-campaign score doesn't fan out N queries. Trending = #
    // donations + # views in the last TRENDING_WINDOW_HOURS.
    const candidateIds = candidates.map((c) => c.id);
    const trendingCounts = await this.loadTrendingCounts(candidateIds);

    // Campaigns the user already donated to + their own campaigns:
    // both still appear in the feed but with a softening multiplier
    // applied to the final score (defined inline below). Donated-to
    // is a weaker penalty than own-creator since revisiting a
    // campaign you backed before is a reasonable suggestion ("top
    // up your previous donation"); the user's own campaign is the
    // weakest fit ("nothing new here") so it sinks further.
    const donatedToIds = await this.donationRepo
      .createQueryBuilder('d')
      .select('DISTINCT d.campaign_id', 'cid')
      .where('d.donor_id = :uid', { uid: user.id })
      .getRawMany<{ cid: string }>()
      .then((rows) => new Set(rows.map((r) => r.cid)));

    const now = Date.now();

    const scored = candidates
      .map((c) => {
        const contentScore = hasProfile
          ? this.cosineSimilarity(userTags, c.tags ?? [])
          : 0;

        const ageDays = (now - c.createdAt.getTime()) / 86_400_000;
        const freshnessScore = Math.pow(
          0.5,
          ageDays / FRESHNESS_HALF_LIFE_DAYS,
        );

        // log1p so a campaign with 100 views/donations doesn't
        // dominate 10 → log scales the trending sub-score nicely.
        const trending = trendingCounts.get(c.id) ?? 0;
        const trendingScore = Math.min(1, Math.log1p(trending) / Math.log(50));

        const localityScore = this.localityMatch(user, c) ? 1 : 0;

        // Soft penalties — we don't filter these campaigns out, we
        // just push them down so fresh / interesting alternatives
        // rank above them. A user's OWN campaign sinks hardest
        // (×0.3) because there's no discovery value; an already-
        // donated-to campaign is gentler (×0.7) because revisiting
        // a backed cause is a reasonable nudge to top up.
        let penalty = 1;
        if (c.creatorId === user.id) penalty *= 0.3;
        if (donatedToIds.has(c.id)) penalty *= 0.7;

        const score = penalty * (
          SCORE_WEIGHTS.content * contentScore +
          SCORE_WEIGHTS.freshness * freshnessScore +
          SCORE_WEIGHTS.trending * trendingScore +
          SCORE_WEIGHTS.locality * localityScore
        );

        const reason = this.explain({
          contentScore,
          freshnessScore,
          trendingScore,
          localityScore,
          hasProfile,
        });

        return Object.assign(c, { _feedScore: +score.toFixed(6), _reason: reason });
      })
      .sort((a, b) => b._feedScore - a._feedScore);

    const startIdx =
      opts.cursor != null
        ? scored.findIndex((c) => c._feedScore < opts.cursor!)
        : 0;
    const page = scored.slice(
      startIdx === -1 ? scored.length : startIdx,
      (startIdx === -1 ? scored.length : startIdx) + limit,
    );
    const nextCursor =
      page.length === limit ? page[page.length - 1]._feedScore : null;

    this.logger.log(
      `getForYouFeed user=${user.id} scored=${scored.length} returned=${page.length} top=${page[0]?._reason ?? 'n/a'}`,
    );

    return { items: page, nextCursor };
  }

  // cosine(user_vector, campaign_vector) where the campaign vector
  // is 1-hot over its tags (presence/absence). Equivalent to
  // (sum of user weights for tags the campaign has) / (||user|| · ||camp||).
  private cosineSimilarity(
    userTags: Record<string, number>,
    campaignTags: string[],
  ): number {
    if (campaignTags.length === 0) return 0;
    let dot = 0;
    for (const tag of campaignTags) {
      dot += userTags[tag] ?? 0;
    }
    const userMag = Math.sqrt(
      Object.values(userTags).reduce((a, w) => a + w * w, 0),
    );
    const campMag = Math.sqrt(campaignTags.length);
    if (userMag === 0 || campMag === 0) return 0;
    return dot / (userMag * campMag);
  }

  private localityMatch(user: User, c: Campaign): boolean {
    // Coarse — same string match on `campaign.location` vs a
    // best-guess user location field. Returns false if either side
    // is missing rather than guessing.
    const userLoc =
      (user as User & { location?: string | null }).location?.toLowerCase() ?? '';
    const campLoc = (c.location ?? '').toLowerCase();
    if (!userLoc || !campLoc) return false;
    return userLoc.includes(campLoc) || campLoc.includes(userLoc);
  }

  // Bulk count of trending engagement (recent donations + views)
  // per candidate campaign id. Two raw aggregate queries so the
  // candidate-pool scoring step is O(1) DB roundtrips instead of
  // O(N).
  private async loadTrendingCounts(
    campaignIds: string[],
  ): Promise<Map<string, number>> {
    if (campaignIds.length === 0) return new Map();
    const since = new Date(
      Date.now() - TRENDING_WINDOW_HOURS * 60 * 60 * 1000,
    );

    const counts = new Map<string, number>();

    const donations = await this.donationRepo
      .createQueryBuilder('d')
      .select('d.campaign_id', 'cid')
      .addSelect('COUNT(*)', 'n')
      .where('d.campaign_id IN (:...ids)', { ids: campaignIds })
      .andWhere('d.created_at >= :since', { since })
      .groupBy('d.campaign_id')
      .getRawMany<{ cid: string; n: string }>();
    for (const r of donations) {
      counts.set(r.cid, (counts.get(r.cid) ?? 0) + Number(r.n));
    }

    const views = await this.viewRepo
      .createQueryBuilder('v')
      .select('v.campaign_id', 'cid')
      .addSelect('COUNT(*)', 'n')
      .where('v.campaign_id IN (:...ids)', { ids: campaignIds })
      .andWhere('v.viewed_at >= :since', { since })
      .groupBy('v.campaign_id')
      .getRawMany<{ cid: string; n: string }>();
    for (const r of views) {
      counts.set(r.cid, (counts.get(r.cid) ?? 0) + Number(r.n));
    }

    return counts;
  }

  // One-line "why am I seeing this?" string for the client. Helpful
  // both for debug overlays and for surfacing a tasteful chip on
  // each card later ("Because you like education campaigns").
  private explain(parts: {
    contentScore: number;
    freshnessScore: number;
    trendingScore: number;
    localityScore: number;
    hasProfile: boolean;
  }): string {
    if (!parts.hasProfile) {
      if (parts.trendingScore > 0.3) return 'Trending now';
      if (parts.freshnessScore > 0.7) return 'Just launched';
      return 'Popular on GreyFundr';
    }
    const top = Object.entries({
      'Matches your interests': parts.contentScore * SCORE_WEIGHTS.content,
      Trending: parts.trendingScore * SCORE_WEIGHTS.trending,
      'Just launched': parts.freshnessScore * SCORE_WEIGHTS.freshness,
      'Near you': parts.localityScore * SCORE_WEIGHTS.locality,
    }).sort(([, a], [, b]) => b - a);
    return top[0]?.[0] ?? 'Suggested for you';
  }

  // Lightweight wrapper used by the view-beacon endpoint. Inserts
  // a CampaignView row. Cheap fire-and-forget from the caller.
  async recordView(opts: {
    campaignId: string;
    userId: string | null;
    dwellMs?: number | null;
  }): Promise<void> {
    try {
      await this.viewRepo.save(
        this.viewRepo.create({
          campaignId: opts.campaignId,
          userId: opts.userId,
          dwellMs: opts.dwellMs ?? null,
        }),
      );
    } catch (err) {
      // The beacon is best-effort — a missing campaign FK shouldn't
      // crash the donor's app. Log and swallow.
      this.logger.warn(
        `recordView failed (campaign=${opts.campaignId}): ${(err as Error).message}`,
      );
    }
  }
}
