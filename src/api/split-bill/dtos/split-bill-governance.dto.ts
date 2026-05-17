import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MaxLength,
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
