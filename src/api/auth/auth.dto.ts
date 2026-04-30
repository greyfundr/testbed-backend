import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  // IsStrongPassword,
  Length,
  Matches,
  MaxLength,
  MinLength,
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
  // @IsStrongPassword()
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
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))

  @ApiProperty({ description: 'OTP' })
  @IsNotEmpty({ message: 'OTP is required' })
  otp: string;
}

export class ResendOtpDto {
  @ApiProperty({
    description: 'Email address or phone number',
    example: '+2347042674347',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty({ message: 'Email or phone number is required' })
  @IsString()
  emailOrPhone: string;
}

export class ForgotPasswordDto {
  @IsNotEmpty({ message: 'emailOrPhone is required' })
  @IsString({ message: 'emailOrPhone must be a string' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Validate(IsEmailOrPhoneConstraint)
  emailOrPhone: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword: string;

  @IsString()
  confirmNewPassword: string;
}

export class LoginDto {
  @IsNotEmpty({ message: 'emailOrPhone is required' })
  @IsString({ message: 'emailOrPhone must be a string' })
  @Validate(IsEmailOrPhoneConstraint)
  emailOrPhone: string;

  @ApiProperty({ description: 'Password' })
  @IsNotEmpty({ message: 'Password is required' })
  // @IsStrongPassword()
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
  // @Transform(({ value }) => value === 'true')
  agreeToTerms: boolean;

  @ApiProperty({ description: 'Date of birth', example: '1990-01-01' })
  @IsNotEmpty({ message: 'Date of birth is required' })
  @IsString({ message: 'Date of birth must be a string in YYYY-MM-DD format' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Date of birth must be in YYYY-MM-DD format',
  })
  dateOfBirth: string;
}

export class CompleteKycDto {
  @ApiProperty({ description: 'CAC number', required: false })
  @IsOptional()
  @IsString()
  cacNumber?: string;

  @ApiProperty({ description: 'Company name', required: false })
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiProperty({
    description: 'Tax Identification Number (TIN)',
    required: false,
  })
  @IsOptional()
  @IsString()
  tin?: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token' })
  @IsNotEmpty({ message: 'Refresh token is required' })
  @IsString()
  refreshToken: string;
}

export class SetPinDto {
  @ApiProperty({ description: '6-digit PIN', example: '123456' })
  @Length(6, 6, { message: 'PIN must be exactly 6 digits' })
  @IsNotEmpty({ message: 'PIN is required' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'PIN must be 6 numeric digits' })
  pin: string;
}

export class ChangePinDto {
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  currentPin: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  newPin: string;
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

export class VerifyResetOtpDto {
  @IsString()
  @MinLength(1)
  emailOrPhone: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'OTP must be 6 digits' })
  otp: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(1)
  resetToken: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  newPassword: string;

  @IsString()
  confirmNewPassword: string;
}
