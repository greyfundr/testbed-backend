import {
  Controller,
  Post,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
  UnauthorizedException,
  Headers,
  Body,
  RawBodyRequest,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PaymentWebhookService, PaymentService } from '../services';

/**
 * Paystack Webhook Controller
 *
 * Security requirements:
 *  1. Always verify HMAC-SHA512 signature BEFORE touching the payload.
 *  2. Always return HTTP 200 to acknowledge receipt, even for events we
 *     don't handle — Paystack retries on non-200 responses.
 *  3. The route must receive the raw body (Buffer), not the parsed JSON body,
 *     because signature verification operates on the raw bytes.
 *
 * NestJS setup required in main.ts:
 *   app.use('/paystack/webhook', express.raw({ type: 'application/json' }));
 *   app.use(express.json()); // for all other routes
 *
 * Or enable rawBody globally:
 *   const app = await NestFactory.create(AppModule, { rawBody: true });
 */
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
    // ── Step 1: Signature verification ───────────────────────────────────────
    // rawBody is the Buffer of the raw request body — required for HMAC verification.
    // NestJS populates req.rawBody when rawBody: true is set in NestFactory.create().
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

    // ── Step 2: Parse payload ─────────────────────────────────────────────────
    let payload: { event: string; data: Record<string, any> };
    try {
      payload = JSON.parse(rawBody.toString());
    } catch (err) {
      this.logger.error('Failed to parse webhook payload', err);
      res.status(HttpStatus.OK).json({ message: 'Acknowledged' }); // 200 to stop retries
      return;
    }

    const { event, data } = payload;

    this.logger.log(`Webhook received: ${event}`);

    // ── Step 3: Dispatch ──────────────────────────────────────────────────────
    // Always respond 200 immediately. Processing is done synchronously here but
    // for high-volume production apps, push to a queue (BullMQ) and ack instantly.
    try {
      await this.webhookService.dispatch(event, data);
      res.status(HttpStatus.OK).json({ message: 'Processed' });
    } catch (err: any) {
      // Log the error but still return 200 for events we've already logged
      // to avoid duplicate processing on Paystack's retry.
      // The error is persisted in WebhookLog.processingError for ops visibility.
      this.logger.error(`Webhook handler threw: ${err?.message}`, err?.stack);

      // Return 500 only for charge.success failures — we want Paystack to retry
      // those since missing a funding credit is critical.
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
