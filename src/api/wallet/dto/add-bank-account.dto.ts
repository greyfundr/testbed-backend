import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsOptional,
  Length,
  Matches,
} from 'class-validator';

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
