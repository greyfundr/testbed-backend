import {
  Controller,
  Post,
  Body,
  Patch,
  UseGuards,
  HttpCode,
  Get,
  HttpStatus,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import {
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
  ChangePasswordDto,
  ChangePinDto,
  ResetPasswordDto,
  VerifyResetOtpDto,
} from '../auth.dto';
import { ApiBearerAuth, ApiBody, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../decorators/current-user.decorator';
import { User } from '../../user/entities/user.entity';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { VerifyTwoFactorDto } from '../../settings';

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

  @ApiOperation({
    summary: 'Verify forgot-password OTP — returns a reset token',
  })
  @ApiBody({ type: VerifyResetOtpDto })
  @Post('verify-reset-otp')
  @HttpCode(HttpStatus.OK)
  async verifyResetOtp(@Body() body: VerifyResetOtpDto) {
    const resetToken = await this.authService.verifyResetOtp(body);
    return {
      success: true,
      message: 'OTP verified. Use the reset token to set your new password.',
      data: { resetToken },
    };
  }

  @ApiOperation({
    summary: 'Reset password using token issued after OTP verification',
  })
  @ApiBody({ type: ResetPasswordDto })
  @Patch('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() body: ResetPasswordDto) {
    await this.authService.resetPassword(body);
    return {
      success: true,
      message:
        'Password reset successfully. You can now log in with your new password.',
    };
  }

  @ApiOperation({ summary: 'Change password — requires current password' })
  @ApiBody({ type: ChangePasswordDto })
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @Body() body: ChangePasswordDto,
    @CurrentUser() user: User,
  ) {
    await this.authService.changePassword(body, user.id);
    return {
      success: true,
      message: 'Password changed successfully',
    };
  }

  @ApiOperation({ summary: 'Check if a username is already taken' })
  @Get('check-username')
  @UseGuards(JwtAuthGuard)
  async checkUsername(
    @CurrentUser() user: User,
    @Query('username') username: string,
  ) {
    if (!username) {
      throw new BadRequestException('Username query parameter is required');
    }
    return await this.authService.checkUsername(username, user?.id);
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

  @ApiOperation({ summary: 'Set PIN (6-digit) for the first time' })
  @ApiBody({ type: SetPinDto })
  @Post('set-pin')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async setPin(@Body() body: SetPinDto, @CurrentUser() user: User) {
    return await this.authService.setPin(user.id, body.pin);
  }

  @ApiOperation({ summary: 'Change existing PIN — requires current PIN' })
  @ApiBody({ type: ChangePinDto })
  @Post('change-pin')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async changePin(@Body() body: ChangePinDto, @CurrentUser() user: User) {
    return await this.authService.changePin(user.id, body);
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
