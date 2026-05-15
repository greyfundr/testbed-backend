import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CampaignAmplifier, Donation, Campaign } from '../entities';
import { UserRepository } from '../../user/repository/user.repository';

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
      return this.buildShareInfo(existing, campaign.shareSlug);
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
    return this.buildShareInfo(amplifier, campaign.shareSlug);
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

  private buildShareInfo(amplifier: CampaignAmplifier, shareSlug: string) {
    const base = process.env.APP_BASE_URL?.replace(/\/$/, '') ?? '';
    const shareUrl = base
      ? `${base}/c/${shareSlug}?ref=${amplifier.code}`
      : `/c/${shareSlug}?ref=${amplifier.code}`;
    return {
      id: amplifier.id,
      code: amplifier.code,
      shareUrl,
      campaignId: amplifier.campaignId,
    };
  }
}
