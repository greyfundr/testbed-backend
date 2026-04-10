import {
  IsInt,
  IsNumber,
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
  @ApiProperty({
    description: 'Amount in Naira',
    example: 5000,
  })
  @IsNumber()
  @Min(100, { message: 'Minimum top-up is ₦100' })
  @Max(10_000_000, {
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
    example: 500,
  })
  @IsNumber()
  @Min(100, { message: 'Minimum withdrawal is ₦100' })
  amount: number;

  @IsString()
  @IsNotEmpty()
  transactionPin: string;
}

const PIN_REGEX = /^\d{4}$/;
const PIN_MSG = 'PIN must be exactly 4 digits';

export class SetTransactionPinDto {
  @IsString()
  @Length(4, 4)
  @Matches(PIN_REGEX, { message: PIN_MSG })
  pin: string;

  @IsString()
  @Length(4, 4)
  @Matches(PIN_REGEX, { message: PIN_MSG })
  confirmPin: string;
}

export class ChangeTransactionPinDto {
  @IsString()
  @IsNotEmpty()
  currentPin: string;

  @IsString()
  @Length(4, 4)
  @Matches(PIN_REGEX, { message: PIN_MSG })
  newPin: string;

  @IsString()
  @Length(4, 4)
  @Matches(PIN_REGEX, { message: PIN_MSG })
  confirmPin: string;
}

export class VerifyTransactionPinDto {
  @IsString()
  @IsNotEmpty()
  pin: string;
}
