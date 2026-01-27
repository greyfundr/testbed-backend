import {
  Controller,
  Post,
  Body,
  Patch,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import {
  CreatePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  LoginResponseDto,
  SignupDto,
  VerifyOtpDto,
  SubmitBasicInfoDto,
  CompleteKycDto,
} from '../auth.dto';
import { ApiBody, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../decorators/current-user.decorator';
import { User } from '../../user/entities/user.entity';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @ApiOperation({ summary: 'Register a new user' })
  @ApiBody({ type: SignupDto })
  @Post('signup')
  async signup(@Body() body: SignupDto) {
    await this.authService.signup(body);
    return {
      success: true,
      message:
        'Signup successful! A one-time password has been sent to your phone number.',
    };
  }

  @ApiOperation({ summary: 'Login' })
  @HttpCode(200)
  @Post('login')
  async login(@Body() body: LoginDto): Promise<LoginResponseDto> {
    const response = await this.authService.login(body);
    return {
      success: true,
      message: 'Login successful!',
      data: response.data,
      accessToken: response.access_token,
    };
  }
  
  @ApiOperation({ summary: 'Verify OTP' })
  @Patch('verify-otp')
  async verifyOtp(@Body() body: VerifyOtpDto) {
    const response = await this.authService.verifyOtp(body);
    return {
      success: true,
      message: 'Verification successful!',
      accessToken: response.access_token,
    };
  }

  @ApiOperation({ summary: 'Forgot password' })
  @ApiBody({ type: ForgotPasswordDto })
  @Patch('forgot-password')
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    await this.authService.forgotPassword(body);
    return {
      success: true,
      message: 'Password reset OTP has been sent to your email.',
    };
  }

  @ApiOperation({ summary: 'Create password' })
  @ApiBody({ type: CreatePasswordDto })
  @Post('create-password')
  @UseGuards(JwtAuthGuard)
  async createPassword(
    @Body() body: CreatePasswordDto,
    @CurrentUser() user: User,
  ) {
    await this.authService.createNewPassword(body, user.uuid);
    return {
      success: true,
      message: 'Password updated successfully!',
    };
  }

  @ApiOperation({ summary: 'Submit basic information' })
  @ApiBody({ type: SubmitBasicInfoDto })
  @Post('submit-basic-info')
  @UseGuards(JwtAuthGuard)
  async submitBasicInfo(
    @Body() body: SubmitBasicInfoDto,
    @CurrentUser() user: User,
  ) {
    await this.authService.submitBasicInfo(body, user.uuid);
    return {
      success: true,
      message: 'Basic information submitted successfully!',
    };
  }

  @ApiOperation({ summary: 'Complete KYC verification' })
  @ApiBody({ type: CompleteKycDto })
  @Patch('complete-kyc')
  @UseGuards(JwtAuthGuard)
  async completeKyc(@Body() body: CompleteKycDto, @CurrentUser() user: User) {
    await this.authService.completeKyc(body, user.uuid);
    return {
      success: true,
      message: 'KYC completed successfully!',
    };
  }
}
