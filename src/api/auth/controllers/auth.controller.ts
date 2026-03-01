import {
  Controller,
  Post,
  Body,
  Patch,
  UseGuards,
  HttpCode,
  Get,
  HttpStatus,
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
  RefreshTokenDto,
  LoginPinDto,
  SetPinDto,
  ResendOtpDto,
} from '../auth.dto';
import { ApiBearerAuth, ApiBody, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../decorators/current-user.decorator';
import { User } from '../../user/entities/user.entity';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { VerifyTwoFactorDto } from '../../settings';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) { }

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
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
    };
  }

  @ApiOperation({ summary: 'Refresh tokens' })
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Body() body: RefreshTokenDto) {
    const response = await this.authService.refreshTokens(body.refreshToken);
    return {
      success: true,
      message: 'Tokens refreshed successful!',
      ...response,
    };
  }

  @ApiOperation({ summary: 'Verify OTP' })
  @Patch('verify-otp')
  async verifyOtp(@Body() body: VerifyOtpDto) {
    const response = await this.authService.verifyOtp(body);
    return {
      success: true,
      message: 'Verification successful!',
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
    };
  }

  @ApiOperation({ summary: 'Resend OTP' })
  @Patch('resend-otp')
  async resendOtp(@Body() body: ResendOtpDto) {
    const response = await this.authService.resendOtp(body);
    return {
      success: true,
      message: response.message,
    };
  }

  @ApiOperation({ summary: 'Forgot password' })
  @ApiBody({ type: ForgotPasswordDto })
  @Patch('forgot-password')
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    await this.authService.forgotPassword(body);
    return {
      success: true,
      message: 'Password reset OTP has been sent to your phone number.',
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
    await this.authService.createNewPassword(body, user.id);
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
    await this.authService.submitBasicInfo(body, user.id);
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
    await this.authService.completeKyc(body, user.id);
    return {
      success: true,
      message: 'KYC completed successfully!',
    };
  }

  @ApiOperation({ summary: 'Login with PIN' })
  @HttpCode(200)
  @Post('login-pin')
  async loginPin(@Body() body: LoginPinDto): Promise<LoginResponseDto> {
    const response = await this.authService.loginWithPin(body);
    return {
      success: true,
      message: 'Login successful!',
      data: response.data,
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
    };
  }

  @ApiOperation({ summary: 'Set 6-digit PIN' })
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Post('set-pin')
  async setPin(@Body() body: SetPinDto, @CurrentUser() user: User) {
    await this.authService.setPin(user.id, body.pin);
    return {
      success: true,
      message: 'PIN set successfully!',
    };
  }

  @ApiOperation({ summary: 'Endpoint to enable two factor authentication' })
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Get('generate')
  async generate(@CurrentUser() user: User) {
    const data = await this.authService.enable2FA(user.id);

    return {
      success: true,
      message: `Two factor enabled for user successfully`,
      data,
    };
  }

  @ApiOperation({ summary: 'Endpoint to verify two factor authentication' })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('verify')
  async verify(
    @CurrentUser() user: User,
    @Body() verifyDto: VerifyTwoFactorDto,
  ) {
    return await this.authService.verify2FA(user.id, verifyDto.token);
  }

  @ApiOperation({ summary: 'Endpoint to validate two factor authentication' })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('validate')
  async validate2FA(
    @CurrentUser() user: User,
    @Body() body: VerifyTwoFactorDto,
  ) {
    return this.authService.validate2FALogin(user.id, body.token);
  }

  @ApiOperation({ summary: 'Endpoint to disable two factor authentication' })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('disable')
  async disable(
    @CurrentUser() user: User,
    @Body() verifyDto: VerifyTwoFactorDto,
  ) {
    return await this.authService.disable2FA(user.id, verifyDto.token);
  }
}
