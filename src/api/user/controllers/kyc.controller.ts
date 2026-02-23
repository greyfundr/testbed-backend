import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { KycService } from '../services';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../entities';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SubmitKycDto } from '../dtos';

@ApiTags('KYC')
@Controller('users/kyc')
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiOperation({ summary: 'Submit KYC documents' })
  @ApiResponse({ status: 201, description: 'KYC submitted successfully' })
  submitKyc(@CurrentUser() user: User, @Body() submitKycDto: SubmitKycDto) {
    return this.kycService.submitKyc(user, submitKycDto);
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Get('status')
  @ApiOperation({ summary: 'Get current KYC status' })
  getKycStatus(@CurrentUser() user: User) {
    return this.kycService.getKycStatus(user);
  }
}
