import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCampaignUpdateDto {
  @ApiProperty({
    description: 'Update body (plain text)',
    example: 'We hit our first milestone — thank you to everyone who shared.',
  })
  @IsString()
  @MaxLength(2000)
  body: string;

  @ApiPropertyOptional({
    description: 'Pin this update to the top of the timeline',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}

export class CampaignUpdateAuthorDto {
  @ApiProperty() id: string;
  @ApiPropertyOptional() firstName?: string;
  @ApiPropertyOptional() lastName?: string;
  @ApiPropertyOptional() profileImage?: string;
}

export class CampaignUpdateResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() campaignId: string;
  @ApiProperty() body: string;
  @ApiProperty() pinned: boolean;
  @ApiProperty() createdAt: Date;
  @ApiProperty({ type: CampaignUpdateAuthorDto })
  author: CampaignUpdateAuthorDto;
}
