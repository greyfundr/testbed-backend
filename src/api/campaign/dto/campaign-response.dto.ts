import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CampaignStatus } from '../enums/campaign.enum';
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

  @ApiPropertyOptional()
  shareSlug?: string;

  @ApiPropertyOptional()
  shareUrl?: string;

  @ApiProperty({ type: CampaignCreatorDto })
  creator: CampaignCreatorDto;

  @ApiProperty()
  createdAt: Date;
}

export class CampaignCategoryResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  icon: string;
}
