import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { KycService } from '../services';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../entities';
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SubmitKycDto } from '../dtos';
import { Request, Response } from 'express';

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

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Post('session')
  @ApiOperation({ summary: 'Endpoint to create user kyc session' })
  async createSessionV2(@CurrentUser() user: User) {
    return await this.kycService.createKycSession(user.id);
  }

  @ApiExcludeEndpoint()
  // @Allowed('kyc-verification-webhook')
  @Post('verification/webhook')
  @HttpCode(HttpStatus.OK)
  async handleKycVerificationWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Res() res: Response,
    @Headers('x-signature') signature: string,
  ) {
    if (!signature) {
      throw new UnauthorizedException('Missing x-signature header');
    }

    const rawBody = req.rawBody?.toString('utf8') ?? JSON.stringify(req.body);

    try {
      await this.kycService.handleKycVerificationWebhook(
        req.body,
        rawBody,
        signature,
      );
      return res.sendStatus(200);
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        return res.sendStatus(401);
      }
      return res.sendStatus(200);
    }
  }
}
