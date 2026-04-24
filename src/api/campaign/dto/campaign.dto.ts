import {
  IsString,
  IsEnum,
  IsNumber,
  IsArray,
  IsOptional,
  IsDateString,
  IsBoolean,
  ValidateNested,
  Min,
  IsUrl,
  IsPositive,
  IsNotEmpty,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CampaignCategory, DonationOnBehalfOf } from '../enums/campaign.enum';
import { PaginationDto } from 'src/common/helpers';

class CampaignOfferDto {
  @IsEnum(['auto', 'manual'])
  type: 'auto' | 'manual';

  @IsString()
  condition: string;

  @IsString()
  reward: string;
}

class CampaignBudgetDto {
  @IsString()
  item: string;

  @IsPositive()
  @IsNumber()
  cost: number;

  @IsString()
  image: string;
}

class CampaignImageDto {
  @IsUrl()
  imageUrl: string;

  @IsString()
  providerId: string;
}

export class CreateCampaignDto {
  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsString()
  category: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CampaignOfferDto)
  offers?: CampaignOfferDto[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CampaignBudgetDto)
  budget?: CampaignBudgetDto[];

  @IsNumber()
  @Min(100)
  target: number;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CampaignImageDto)
  images?: CampaignImageDto[];

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  participants?: string[];
}

export class UpdateCampaignDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(CampaignCategory)
  @IsOptional()
  category?: CampaignCategory;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CampaignOfferDto)
  offers?: CampaignOfferDto[];

  @IsNumber()
  @Min(100)
  @IsOptional()
  target?: number;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CampaignImageDto)
  images?: CampaignImageDto[];

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  participants?: string[];
}

class ExternalPersonDto {
  @ApiProperty({
    description: 'Full name of the person being donated on behalf of',
    example: 'John Doe',
  })
  @IsString()
  fullName: string;

  @ApiProperty({
    description: 'Phone number of the person being donated on behalf of',
    example: '+2348012345678',
  })
  @IsString()
  phoneNumber: string;
}

export enum PaymentMethod {
  WALLET = 'wallet',
  PAYSTACK = 'paystack',
}

export class DonateDto {
  @ApiProperty({
    description: 'Amount to donate in Naira',
    example: 5000,
    minimum: 100,
  })
  @IsNumber()
  @Min(100)
  amount: number; // In Naira

  @ApiPropertyOptional({
    description: 'Whether to remain anonymous',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  isAnonymous?: boolean;

  @ApiPropertyOptional({
    description: 'Custom username to display for the donation',
    example: 'SuperHelper',
  })
  @IsString()
  @IsOptional()
  username?: string;

  @ApiPropertyOptional({
    description: 'Entity being donated on behalf of',
    enum: DonationOnBehalfOf,
    default: DonationOnBehalfOf.SELF,
  })
  @IsEnum(DonationOnBehalfOf)
  @IsOptional()
  onBehalfOf?: DonationOnBehalfOf;

  @ApiPropertyOptional({
    description:
      'App user ID if onBehalfOf is USER. Required if onBehalfOf is USER.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  @IsOptional()
  onBehalfOfUserId?: string;

  @ApiPropertyOptional({
    description:
      'External person details if onBehalfOf is EXTERNAL. Required if onBehalfOf is EXTERNAL.',
    type: ExternalPersonDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExternalPersonDto)
  onBehalfOfExternal?: ExternalPersonDto;

  @ApiPropertyOptional({
    description: 'Optional comment for the donation',
    example: 'Keep up the good work!',
  })
  @IsString()
  @IsOptional()
  comment?: string;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({
    description: 'Transaction PIN (Required if paymentMethod is wallet)',
  })
  @ValidateIf((o) => o.paymentMethod === PaymentMethod.WALLET)
  @IsString()
  @IsNotEmpty({ message: 'Transaction PIN is required for wallet payments' })
  transactionPin?: string;
}

export class CampaignFilterDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filter campaigns by category name',
    example: 'Education',
  })
  @IsOptional()
  @IsString()
  category?: string;
}
