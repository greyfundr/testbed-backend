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
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ApprovalThresholdMode,
  CampaignCategory,
  CampaignStatus,
  DonationOnBehalfOf,
} from '../enums/campaign.enum';
import { PaginationDto } from 'src/common/helpers';
import { CreateVendorDto } from './campaign-vendor.dto';

class CampaignOfferDto {
  @IsEnum(['auto', 'manual'])
  type: 'auto' | 'manual';

  @IsString()
  condition: string;

  @IsString()
  reward: string;
}

class CampaignStoryBlockDto {
  @IsString()
  @IsIn(['lead', 'p', 'h', 'quote'])
  type: 'lead' | 'p' | 'h' | 'quote';

  @IsString()
  @IsOptional()
  text?: string;

  @IsString()
  @IsOptional()
  by?: string;
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

// Update-time budget item: same shape, but id/image are optional so
// the Manage-budget sheet can preserve existing items by id and skip
// images entirely. New items omit id and the service assigns one.
class UpdateCampaignBudgetDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  item: string;

  @IsPositive()
  @IsNumber()
  cost: number;

  @IsString()
  @IsOptional()
  image?: string;
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

  @ApiPropertyOptional({
    description: 'City / state for the location chip',
    example: 'Maiduguri, Borno',
  })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional({
    description: 'Show URGENT badge on listings',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  urgent?: boolean;

  @ApiPropertyOptional({
    description:
      'Trust / accountability note shown under About on the details page',
  })
  @IsString()
  @IsOptional()
  accountabilityNote?: string;

  @ApiPropertyOptional({
    description:
      'Optional typed story blocks. If omitted, description is auto-wrapped as one lead block.',
    type: [CampaignStoryBlockDto],
  })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CampaignStoryBlockDto)
  story?: CampaignStoryBlockDto[];

  @ApiPropertyOptional({
    description:
      "How the proposal approval threshold is computed. 'auto' uses ceil(approvers * 0.33), min 2. 'manual' uses approvalThresholdCount.",
    enum: ApprovalThresholdMode,
    default: ApprovalThresholdMode.AUTO,
  })
  @IsOptional()
  @IsEnum(ApprovalThresholdMode)
  approvalThresholdMode?: ApprovalThresholdMode;

  @ApiPropertyOptional({
    description:
      "Manual approver count, applied only when approvalThresholdMode='manual'.",
    example: 3,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  approvalThresholdCount?: number;

  @ApiPropertyOptional({
    description:
      'Initial saved vendors / beneficiaries to seed for this campaign.',
    type: [CreateVendorDto],
  })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateVendorDto)
  vendors?: CreateVendorDto[];
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
  @ValidateNested({ each: true })
  @Type(() => UpdateCampaignBudgetDto)
  budget?: UpdateCampaignBudgetDto[];

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  participants?: string[];
}

// Creator-only status transitions: pause an active campaign,
// resume a paused one, or cancel it. Admin/automated statuses
// (pending_approval, rejected, completed, expired) are intentionally
// not accepted here.
export class UpdateCampaignStatusDto {
  @ApiProperty({
    description: 'New status for the campaign',
    enum: [CampaignStatus.ACTIVE, CampaignStatus.PAUSED, CampaignStatus.CANCELLED],
    example: CampaignStatus.PAUSED,
  })
  @IsEnum([
    CampaignStatus.ACTIVE,
    CampaignStatus.PAUSED,
    CampaignStatus.CANCELLED,
  ])
  status: CampaignStatus;
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

  @ApiPropertyOptional({
    description:
      'Referral code from an amplifier link. If valid, the donation is attributed.',
    example: 'FUNKE128',
  })
  @IsString()
  @IsOptional()
  referrerCode?: string;

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
