import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsPhoneNumber,
  IsString,
  IsStrongPassword,
  Matches,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AccountType } from '../user/enums/user.enum';
import { Transform } from 'class-transformer';

export class SignupDto {
  @ApiProperty({ description: 'Email address', example: 'johndoe@example.com' })
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Phone number', example: '+2348062964137' })
  @IsNotEmpty({ message: 'Phone number is required' })
  @IsPhoneNumber()
  phoneNumber: string;

  @ApiProperty({ description: 'Password' })
  @IsNotEmpty({ message: 'Password is required' })
  @IsStrongPassword()
  password: string;

  @ApiProperty({ description: 'Account type', enum: AccountType })
  @IsNotEmpty({ message: 'Account type is required' })
  @IsEnum(AccountType)
  accountType: AccountType;
}

@ValidatorConstraint({ name: 'isEmailOrPhone', async: false })
export class IsEmailOrPhoneConstraint implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments) {
    if (typeof value !== 'string') {
      return false;
    }

    // Email regex pattern
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Phone regex pattern (supports international formats, digits, spaces, dashes, parentheses, and plus sign)
    const phoneRegex = /^\+?[\d\s\-()]{10,}$/;

    return emailRegex.test(value) || phoneRegex.test(value);
  }

  defaultMessage(args: ValidationArguments) {
    return 'emailOrPhone must be a valid email address or phone number';
  }
}
export class VerifyOtpDto {
  @IsNotEmpty({ message: 'emailOrPhone is required' })
  @IsString({ message: 'emailOrPhone must be a string' })
  @Validate(IsEmailOrPhoneConstraint)
  emailOrPhone: string;

  @ApiProperty({ description: 'OTP' })
  @IsNotEmpty({ message: 'OTP is required' })
  otp: string;
}

export class ForgotPasswordDto {
  @IsNotEmpty({ message: 'emailOrPhone is required' })
  @IsString({ message: 'emailOrPhone must be a string' })
  @Validate(IsEmailOrPhoneConstraint)
  emailOrPhone: string;
}

export class CreatePasswordDto {
  @ApiProperty({ description: 'Password' })
  @IsNotEmpty({ message: 'Password is required' })
  @IsStrongPassword()
  password: string;
}

export class LoginDto {
  @IsNotEmpty({ message: 'emailOrPhone is required' })
  @IsString({ message: 'emailOrPhone must be a string' })
  @Validate(IsEmailOrPhoneConstraint)
  emailOrPhone: string;

  @ApiProperty({ description: 'Password' })
  @IsNotEmpty({ message: 'Password is required' })
  @IsStrongPassword()
  password: string;
}

export class SubmitBasicInfoDto {
  @ApiProperty({ description: 'First name' })
  @IsNotEmpty({ message: 'First name is required' })
  firstName: string;

  @ApiProperty({ description: 'Last name' })
  @IsNotEmpty({ message: 'Last name is required' })
  lastName: string;

  @ApiProperty({ description: 'Username' })
  @IsNotEmpty({ message: 'Username is required' })
  username: string;

  @ApiProperty({ description: 'Agree to terms and conditions' })
  @IsBoolean({ message: 'Agree to terms and conditions must be a boolean' })
  @IsNotEmpty({ message: 'Agree to terms and conditions is required' })
  @Transform(({ value }) => value === 'true')
  agreeToTerms: boolean;
}

export class CompleteKycDto {
  @ApiProperty({ description: 'CAC number' })
  @IsNotEmpty({ message: 'CAC number is required' })
  cacNumber: string;

  @ApiProperty({ description: 'Company name' })
  @IsNotEmpty({ message: 'Company name is required' })
  companyName: string;

  @ApiProperty({ description: 'Tax Identification Number (TIN)' })
  @IsNotEmpty({ message: 'TIN is required' })
  tin: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token' })
  @IsNotEmpty({ message: 'Refresh token is required' })
  @IsString()
  refreshToken: string;
}

export class SetPinDto {
  @ApiProperty({ description: '6-digit PIN', example: '123456' })
  @IsNotEmpty({ message: 'PIN is required' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'PIN must be 6 numeric digits' })
  pin: string;
}

export class LoginPinDto {
  @IsNotEmpty({ message: 'emailOrPhone is required' })
  @IsString({ message: 'emailOrPhone must be a string' })
  @Validate(IsEmailOrPhoneConstraint)
  emailOrPhone: string;

  @ApiProperty({ description: '6-digit PIN', example: '123456' })
  @IsNotEmpty({ message: 'PIN is required' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'PIN must be 6 numeric digits' })
  pin: string;
}

export class BaseResponseDto {
  success: boolean;
  message: string;
}

export class LoginResponseDto extends BaseResponseDto {
  data: Record<string, any>;
  accessToken: string | null;
  refreshToken: string | null;
}
