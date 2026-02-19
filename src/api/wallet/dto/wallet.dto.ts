import {
  IsInt,
  Min,
  Max,
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsOptional,
  Length,
  Matches,
  IsUUID,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InitiateFundingDto {
  @IsInt({
    message: 'Amount must be an integer in kobo (e.g. 500000 = ₦5,000)',
  })
  @Min(10_000, { message: 'Minimum top-up is ₦100' })
  @Max(10_000_000_00, {
    message: 'Maximum top-up is ₦10,000,000 per transaction',
  })
  amount: number;
}

export class AddBankAccountDto {
  @IsString()
  @IsNotEmpty()
  @Length(10, 10, { message: 'Account number must be exactly 10 digits' })
  @Matches(/^\d{10}$/, { message: 'Account number must contain only digits' })
  accountNumber: string;

  @IsString()
  @IsNotEmpty()
  bankCode: string;

  @IsString()
  @IsNotEmpty()
  bankName: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

export class WithdrawDto {
  @ApiProperty({
    description: 'Bank account id',
    example: '',
  })
  @IsUUID()
  bankAccountId: string;

  @ApiProperty({
    description: 'amount',
    example: 50000,
  })
  @IsInt({ message: 'Amount must be an integer in kobo' })
  @Min(10_000, { message: 'Minimum withdrawal is ₦100 (10,000 kobo)' })
  amount: number;
}
