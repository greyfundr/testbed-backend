import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CampaignAmplifier, Donation, Campaign } from '../entities';
import { UserRepository } from '../../user/repository/user.repository';
import { DynamicLinkService } from '../../dynamic-link/services/dynamic-link.service';

@Injectable()
export class CampaignAmplifierService {
  constructor(
    @InjectRepository(CampaignAmplifier)
    private readonly amplifierRepo: Repository<CampaignAmplifier>,
    @InjectRepository(Donation)
    private readonly donationRepo: Repository<Donation>,
    @InjectRepository(Campaign)
    private readonly campaignRepo: Repository<Campaign>,
    private readonly userRepo: UserRepository,
    private readonly dynamicLinkService: DynamicLinkService,
  ) {}

  async claim(campaignId: string, userId: string) {
    const campaign = await this.campaignRepo.findOne({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');

    const existing = await this.amplifierRepo.findOne({
      where: { campaignId, userId },
    });
    if (existing) {
      return this.buildShareInfo(existing, campaign);
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    const baseSlug = (user?.firstName || 'AMP')
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 6);
    let code = '';
    for (let i = 0; i < 5; i++) {
      const suffix = Math.floor(100 + Math.random() * 900);
      const candidate = `${baseSlug}${suffix}`;
      const clash = await this.amplifierRepo.findOne({
        where: { code: candidate },
      });
      if (!clash) {
        code = candidate;
        break;
      }
    }
    if (!code) {
      throw new ConflictException(
        'Could not generate a unique amplifier code, try again',
      );
    }

    const amplifier = this.amplifierRepo.create({ campaignId, userId, code });
    await this.amplifierRepo.save(amplifier);
    return this.buildShareInfo(amplifier, campaign);
  }

  async listForCampaign(campaignId: string) {
    return this.amplifierRepo.find({
      where: { campaignId },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
  }

  async getByCode(code: string) {
    return this.amplifierRepo.findOne({
      where: { code },
      relations: ['campaign'],
    });
  }

  async getById(id: string) {
    return this.amplifierRepo.findOne({ where: { id } });
  }

  // Real count of amplifier (Champion) rows for a campaign — used by
  // the detail mapToResponse so the Champions stat doesn't undercount
  // people who haven't yet influenced a donation. Counts every signup
  // regardless of whether they've driven any contributions.
  async countForCampaign(campaignId: string): Promise<number> {
    return this.amplifierRepo.count({ where: { campaignId } });
  }

  async topForCampaign(campaignId: string, limit = 10) {
    const rows = await this.donationRepo
      .createQueryBuilder('d')
      .select('d.referrer_amplifier_id', 'amplifierId')
      .addSelect('SUM(d.amount)', 'influencedAmount')
      .addSelect('COUNT(*)', 'referralCount')
      .where('d.campaign_id = :campaignId', { campaignId })
      .andWhere('d.referrer_amplifier_id IS NOT NULL')
      .groupBy('d.referrer_amplifier_id')
      .orderBy('influencedAmount', 'DESC')
      .limit(limit)
      .getRawMany<{
        amplifierId: string;
        influencedAmount: string;
        referralCount: string;
      }>();

    if (!rows.length) return [];

    const amplifiers = await this.amplifierRepo.find({
      where: rows.map((r) => ({ id: r.amplifierId })),
      relations: ['user'],
    });
    const ampMap = new Map(amplifiers.map((a) => [a.id, a]));

    return rows.flatMap((r) => {
      const amp = ampMap.get(r.amplifierId);
      if (!amp) return [];
      const u = amp.user;
      const name =
        u?.firstName || u?.lastName
          ? `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim()
          : (u?.username ?? 'Champion');
      return [
        {
          id: amp.id,
          userId: amp.userId,
          name,
          avatar: (u as { profileImage?: string } | undefined)?.profileImage,
          code: amp.code,
          influencedAmount: Number(r.influencedAmount),
          referralCount: Number(r.referralCount),
        },
      ];
    });
  }

  // Build the champion's share package. The shareUrl is routed
  // through DynamicLinkService so the resulting `…/l/<code>` short
  // link, when tapped on a phone, redirects into the app via the
  // existing app-scheme deep-link path with `type`, `id`, `slug`,
  // AND `ref` already in the query string. AppLinkService on the
  // client extracts `ref` and the donate payload forwards it so the
  // backend can attribute the donation to this amplifier.
  //
  // Falls back to the bare `…/c/<slug>?ref=<code>` web URL if the
  // dynamic-link service is unavailable (e.g. the project row was
  // never seeded). The web app reads the same `ref` query param
  // from Uri.base on the client side as a safety net.
  private async buildShareInfo(
    amplifier: CampaignAmplifier,
    campaign: Campaign,
  ) {
    const shareSlug = campaign.shareSlug ?? campaign.id;
    let shareUrl = '';
    try {
      // First campaign image (if any) drives the redirect page's
      // hero card — without this the OS landing page falls back to
      // a brand-colour placeholder.
      const heroImage = campaign.images?.[0]?.imageUrl ?? undefined;
      const link = await this.dynamicLinkService.forCampaign(
        amplifier.campaignId,
        shareSlug,
        campaign.title,
        // Tuck the amplifier code into the metadata so the redirect
        // controller emits it alongside `type=campaign&id=…`.
        { ref: amplifier.code },
        heroImage,
      );
      shareUrl = link.shortUrl;
    } catch {
      // dynamic-link service can be missing in test envs; degrade
      // gracefully to the bare web URL so a champion-claim never
      // outright fails.
    }
    if (!shareUrl) {
      const base = process.env.APP_BASE_URL?.replace(/\/$/, '') ?? '';
      shareUrl = base
        ? `${base}/c/${shareSlug}?ref=${amplifier.code}`
        : `/c/${shareSlug}?ref=${amplifier.code}`;
    }
    return {
      id: amplifier.id,
      code: amplifier.code,
      shareUrl,
      campaignId: amplifier.campaignId,
    };
  }
}
