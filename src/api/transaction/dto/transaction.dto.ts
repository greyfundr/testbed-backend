import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsOptional,
  Length,
  Matches,
  IsDateString,
  IsEnum,
  IsInt,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  TransactionType,
  TransactionDirection,
  TransactionStatus,
} from '../enums/transaction.enum';

export class DonateToCampaignDto {
  @IsUUID()
  campaignId: string;

  @IsInt()
  @Min(100, { message: 'Minimum donation is ₦1 (100 kobo)' })
  amount: number; // in kobo

  @IsString()
  @IsOptional()
  @MaxLength(200)
  note?: string;

  @IsBoolean()
  @IsOptional()
  anonymous?: boolean;
}

export class PaySplitBillDto {
  @IsUUID()
  billId: string;

  @IsUUID()
  billShareId: string;

  @IsInt()
  @Min(100)
  amount: number;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  note?: string;
}

export class PayInvoiceDto {
  @IsUUID()
  invoiceId: string;

  @IsUUID()
  recipientUserId: string;

  @IsInt()
  @Min(100)
  amount: number;
}

export class InternalTransferDto {
  @IsUUID()
  recipientUserId: string;

  @IsInt()
  @Min(100)
  amount: number; // in kobo

  @IsString()
  @IsOptional()
  @MaxLength(200)
  note?: string;
}

export class TransactionQueryDto {
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @IsOptional()
  @IsEnum(TransactionDirection)
  direction?: TransactionDirection;

  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
