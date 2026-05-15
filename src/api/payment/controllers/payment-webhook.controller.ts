import {
  Controller,
  Post,
  Param,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
  Headers,
  Body,
  RawBodyRequest,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { PaymentWebhookService, PaymentService } from '../services';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@Controller('payment')
export class PaymentWebhookController {
  private readonly logger = new Logger(PaymentWebhookController.name);

  constructor(
    private readonly webhookService: PaymentWebhookService,
    private readonly paymentService: PaymentService,
  ) {}

  // Client-side verification fallback for Paystack donations. The web
  // sheet's success callback fires before Paystack's async webhook is
  // guaranteed to have hit our backend — especially in local dev where
  // Paystack can't reach localhost. Hitting this endpoint re-uses the
  // same finalization code path the webhook does, and is idempotent.
  @Post('verify/:reference')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Force-verify a pending Paystack donation by reference and create the Donation row if not already done',
  })
  async verifyDonation(@Param('reference') reference: string) {
    return this.webhookService.finalizeCampaignDonationByReference(reference);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
    @Headers('x-paystack-signature') signature: string,
  ): Promise<void> {
    const rawBody = req.rawBody;

    if (!rawBody || !signature) {
      this.logger.warn('Webhook received without body or signature — rejected');
      res
        .status(HttpStatus.UNAUTHORIZED)
        .json({ message: 'Missing signature' });
      return;
    }

    const isValid = this.paymentService.verifyWebhookSignature(
      rawBody.toString(),
      signature,
    );

    if (!isValid) {
      this.logger.warn(
        `Webhook signature mismatch — possible spoofing attempt. Sig: ${signature.substring(0, 20)}...`,
      );
      res
        .status(HttpStatus.UNAUTHORIZED)
        .json({ message: 'Invalid signature' });
      return;
    }

    let payload: { event: string; data: Record<string, any> };
    try {
      payload = JSON.parse(rawBody.toString());
    } catch (err) {
      this.logger.error('Failed to parse webhook payload', err);
      res.status(HttpStatus.OK).json({ message: 'Acknowledged' });
      return;
    }

    const { event, data } = payload;

    this.logger.log(`Webhook received: ${event}`);

    try {
      await this.webhookService.dispatch(event, data);
      res.status(HttpStatus.OK).json({ message: 'Processed' });
    } catch (err: any) {
      if (event === 'charge.success') {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          message: 'Processing failed — will retry',
        });
      } else {
        res.status(HttpStatus.OK).json({ message: 'Acknowledged with error' });
      }
    }
  }
}
