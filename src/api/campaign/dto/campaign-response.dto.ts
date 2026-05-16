import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ApprovalThresholdMode,
  CampaignStatus,
} from '../enums/campaign.enum';
import { CampaignCategory } from '../entities';

export class CampaignCreatorDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  firstName?: string;

  @ApiPropertyOptional()
  lastName?: string;

  @ApiPropertyOptional()
  username?: string;

  @ApiPropertyOptional()
  profileImage?: string;

  @ApiPropertyOptional({
    description:
      "Creator's account type ('personal' | 'community' | 'business' | 'group'). Drives the campaign's governance track on the client.",
  })
  accountType?: string;

  @ApiPropertyOptional({
    description:
      "Creator's KYC status. Combined with a non-personal accountType, indicates a verified organization.",
  })
  kycStatus?: string;

  @ApiPropertyOptional({
    description:
      'Whether the current viewer follows the creator (user-follow, not organizer-follow). Absent / false when the viewer is unauthenticated or is the creator themselves.',
  })
  isFollowing?: boolean;
}

export class CampaignResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ type: CampaignCategory })
  category: CampaignCategory;

  @ApiProperty()
  target: number;

  @ApiProperty()
  currentAmount: number;

  @ApiProperty()
  startDate: Date;

  @ApiProperty()
  endDate: Date;

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  offers: any[];

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  budget: any[];

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  images: any[];

  @ApiProperty({ enum: CampaignStatus })
  status: CampaignStatus;

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  participants: any[];

  @ApiPropertyOptional()
  shareSlug?: string;

  @ApiPropertyOptional()
  shareUrl?: string;

  @ApiProperty({ type: CampaignCreatorDto })
  creator: CampaignCreatorDto;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  donorsCount: number;

  @ApiProperty()
  likesCount: number;

  @ApiProperty()
  commentsCount: number;

  @ApiPropertyOptional()
  isLiked?: boolean;

  @ApiPropertyOptional()
  isSaved?: boolean;

  @ApiPropertyOptional({ description: 'City / state, free-form' })
  location?: string | null;

  @ApiPropertyOptional({ description: 'Surface as URGENT badge' })
  urgent?: boolean;

  @ApiPropertyOptional({
    description: 'Long-form trust statement shown under About → Story',
  })
  accountabilityNote?: string | null;

  @ApiPropertyOptional({
    description:
      'Typed story blocks (lead/p/h/quote). Falls back to description if null.',
    type: 'array',
    items: { type: 'object' },
  })
  story?: any[] | null;

  @ApiPropertyOptional({
    description: 'Tier definitions (id, tier, min, color, icon, perks[])',
    type: 'array',
    items: { type: 'object' },
  })
  tiers?: any[] | null;

  @ApiPropertyOptional({
    description:
      "How proposal approvals are computed. 'auto' = ceil(approvers * 0.33), min 2.",
    enum: ApprovalThresholdMode,
  })
  approvalThresholdMode?: ApprovalThresholdMode;

  @ApiPropertyOptional({
    description: "Manual approver count when mode='manual'.",
  })
  approvalThresholdCount?: number | null;

  @ApiPropertyOptional({
    description: 'Organizers shown in the rail, with follow state',
    type: 'array',
    items: { type: 'object' },
  })
  organizers?: any[];

  @ApiPropertyOptional({
    description: 'Top amplifiers (champions) by influenced amount',
    type: 'array',
    items: { type: 'object' },
  })
  topAmplifiers?: any[];

  @ApiPropertyOptional({
    description:
      "Whether the current viewer can see financial insight (Collected / Spent / In wallet, wallet hero, extra Financing subtabs). True for creator, organizers, team participants, donors, and attributing champions.",
  })
  canSeeFinancials?: boolean;

  @ApiPropertyOptional({
    description:
      'Total donated by the campaign\'s top donor (single largest contributor). Used as a public stat on the FundingCard when the viewer cannot see financials.',
  })
  topDonorAmount?: number | null;

  @ApiPropertyOptional({
    description:
      "Top donor object (name + amount + avatar). Anonymous-only donors are stripped of name and avatar with `isAnonymous: true` so the UI can render 'Anonymous'.",
  })
  topDonor?: {
    donorId: string;
    amount: number;
    name: string | null;
    profileImage: string | null;
    isAnonymous: boolean;
  } | null;
}

export class CampaignCategoryResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  icon: string;
}
