import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  MaxLength,
  IsEnum,
} from 'class-validator';
import { CampaignVendorKind } from '../enums/campaign.enum';

export class CreateVendorDto {
  @ApiProperty({ example: 'Lagos General Hospital' })
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({
    enum: CampaignVendorKind,
    default: CampaignVendorKind.VENDOR,
  })
  @IsOptional()
  @IsEnum(CampaignVendorKind)
  kind?: CampaignVendorKind;

  @ApiPropertyOptional({ example: 'GTBank' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankName?: string;

  @ApiPropertyOptional({ example: 'Lagos General Hospital LTD' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  accountName?: string;

  @ApiPropertyOptional({ example: '0123456789' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  accountNumber?: string;

  @ApiPropertyOptional({
    description: 'Phone or email',
    example: '+2348012345678',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  contact?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateVendorDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsEnum(CampaignVendorKind) kind?: CampaignVendorKind;
  @IsOptional() @IsString() @MaxLength(120) bankName?: string;
  @IsOptional() @IsString() @MaxLength(120) accountName?: string;
  @IsOptional() @IsString() @MaxLength(32) accountNumber?: string;
  @IsOptional() @IsString() @MaxLength(120) contact?: string;
  @IsOptional() @IsString() notes?: string;
}
