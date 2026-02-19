import {
  Controller,
  Post,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
  Headers,
  Body,
  RawBodyRequest,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PaymentWebhookService, PaymentService } from '../services';

@Controller('payment')
export class PaymentWebhookController {
  private readonly logger = new Logger(PaymentWebhookController.name);

  constructor(
    private readonly webhookService: PaymentWebhookService,
    private readonly paystackService: PaymentService,
  ) {}

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

    const isValid = this.paystackService.verifyWebhookSignature(
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
