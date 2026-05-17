import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  SplitBillProposalVoteValue,
  SplitBillVendorKind,
} from '../enums/split-bill.enum';

export class CreateSplitBillVendorDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsEnum(SplitBillVendorKind)
  kind?: SplitBillVendorKind;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  accountName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  accountNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contact?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateSplitBillProposalDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsNumber()
  @Min(1)
  totalAmount: number;
}

export class CastSplitBillProposalVoteDto {
  @IsEnum(SplitBillProposalVoteValue)
  vote: SplitBillProposalVoteValue;
}

// Single budget line item. Mirrors the Campaign budget shape but
// with `image` optional — split bills are more ad-hoc than campaigns
// so requiring an image per item is overkill. `id` is optional on
// the wire; the service assigns one when a row is new.
export class SplitBillBudgetItemDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @MaxLength(200)
  item: string;

  @IsNumber()
  @Min(0)
  cost: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  image?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

// Replace-the-whole-array payload — same pattern Campaign update
// uses. Empty array clears the budget; omitting the field on the
// general update DTO would be a no-op (handled at the service).
export class UpdateSplitBillBudgetDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SplitBillBudgetItemDto)
  budget: SplitBillBudgetItemDto[];
}
