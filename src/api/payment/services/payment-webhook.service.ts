import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { WebhookLog, Transaction } from '../../transaction/entities';
import { WithdrawalRequest, WithdrawalStatus } from '../../wallet/entities/';
import {
  TransactionType,
  TransactionStatus,
  TransactionDirection,
  LedgerAccountType,
  PaystackWebhookEvent,
} from '../../transaction/enums/transaction.enum';
import { WalletService } from '../../wallet/services';
import { PaymentService } from './payment.service';
import {
  PaystackChargeSuccessData,
  PaystackTransferEventData,
} from '../interfaces/payment.interface';
import {
  TransactionRepository,
  WebhookLogRepository,
} from 'src/api/transaction/repository';
import {
  VirtualAccountRepository,
  WithdrawalRequestRepository,
} from 'src/api/wallet/repository';

@Injectable()
export class PaymentWebhookService {
  private readonly logger = new Logger(PaymentWebhookService.name);

  constructor(
    private readonly webhookLogRepo: WebhookLogRepository,
    private readonly transactionRepo: TransactionRepository,
    private readonly withdrawalRepo: WithdrawalRequestRepository,
    private readonly virtualAccountRepo: VirtualAccountRepository,

    @Inject(forwardRef(() => WalletService))
    private readonly walletService: WalletService,
    private readonly paymentService: PaymentService,
    private readonly dataSource: DataSource,
  ) {}

  // ─── Webhook Entry Point ──────────────────────────────────────────────────────

  /**
   * Main dispatcher. Called from the controller after signature verification.
   *
   * Architecture:
   *   1. Log the raw webhook immediately (idempotency guard first).
   *   2. Dispatch to the correct handler based on event type.
   *   3. Mark the log as processed (or record error + increment retry count).
   *
   * Any unhandled event is silently acknowledged (200 OK) — Paystack re-sends
   * unacknowledged webhooks with exponential backoff, so always return 200.
   */
  async dispatch(event: string, data: Record<string, any>): Promise<void> {
    const reference = this.extractReference(event, data);

    // ── Idempotency guard ───────────────────────────────────────────────────
    // Upsert the log row. If paystackReference already exists AND isProcessed=true,
    // skip processing entirely — Paystack sometimes delivers duplicates.
    const [log, isNew] = await this.upsertWebhookLog(event, reference, data);

    if (!isNew && log.isProcessed) {
      this.logger.warn(`Duplicate webhook ignored: ${event} / ${reference}`);
      return;
    }

    this.logger.log(`Processing webhook: ${event} / ${reference}`);

    try {
      switch (event) {
        case PaystackWebhookEvent.CHARGE_SUCCESS:
          await this.handleChargeSuccess(data as PaystackChargeSuccessData);
          break;

        case PaystackWebhookEvent.TRANSFER_SUCCESS:
          await this.handleTransferSuccess(data as PaystackTransferEventData);
          break;

        case PaystackWebhookEvent.TRANSFER_FAILED:
          await this.handleTransferFailed(data as PaystackTransferEventData);
          break;

        case PaystackWebhookEvent.TRANSFER_REVERSED:
          await this.handleTransferReversed(data as PaystackTransferEventData);
          break;

        case PaystackWebhookEvent.DEDICATEDACCOUNT_ASSIGN:
          await this.handleDvaAssigned(data);
          break;

        default:
          this.logger.log(`Unhandled Paystack event: ${event} — acknowledged`);
          break;
      }

      await this.webhookLogRepo.update(log.id, {
        isProcessed: true,
        processedAt: new Date(),
        processingError: null,
      });

      this.logger.log(`Webhook processed: ${event} / ${reference}`);
    } catch (err: any) {
      const errorMessage = err?.message ?? String(err);
      this.logger.error(
        `Webhook processing failed: ${event} / ${reference} — ${errorMessage}`,
        err?.stack,
      );

      await this.webhookLogRepo.update(log.id, {
        processingError: errorMessage,
        retryCount: +1,
      });

      throw err;
    }
  }

  // ─── charge.success ──────────────────────────────────────────────────────────

  /**
   * Fires when a DVA (bank transfer) or card charge succeeds.
   * We use this exclusively for wallet top-ups.
   *
   * Defence in depth:
   *   - We verify the transaction independently against Paystack before crediting.
   *   - We match via customer_code → virtual_account → wallet.
   *   - If the virtual account is not found, we log and alert but don't error
   *     (so Paystack doesn't keep retrying a webhook we can't handle).
   */
  private async handleChargeSuccess(
    data: PaystackChargeSuccessData,
  ): Promise<void> {
    const { reference, amount, customer, channel } = data;

    // Defence: verify independently (don't rely solely on the webhook payload)
    await this.paymentService.verifyTransaction(reference);

    // Find the virtual account by customer code
    const virtualAccount = await this.virtualAccountRepo.findOne({
      where: { paystackCustomerCode: customer.customer_code },
      relations: ['wallet'],
    });

    if (!virtualAccount) {
      this.logger.error(
        `charge.success — no virtual account for customer ${customer.customer_code} (ref: ${reference})`,
      );
      // Do NOT throw — Paystack would retry indefinitely. Alert ops instead.
      return;
    }

    if (!virtualAccount.wallet) {
      this.logger.error(
        `charge.success — virtual account has no wallet (id: ${virtualAccount.id})`,
      );
      return;
    }

    const walletId = virtualAccount.walletId;
    const amountKobo = amount; // Paystack sends in kobo

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // Create completed transaction record
      const txRef = `WF-${uuidv4().replace(/-/g, '').substring(0, 20).toUpperCase()}`;

      const tx = await qr.manager.save(Transaction, {
        walletId,
        amount: amountKobo,
        currency: 'NGN',
        type: TransactionType.WALLET_FUNDING,
        direction: TransactionDirection.CREDIT,
        status: TransactionStatus.COMPLETED,
        reference: txRef,
        paystackReference: reference,
        description: `Wallet top-up via ${this.channelLabel(channel)}`,
        gatewayResponse: data,
        confirmedAt: new Date(data.paid_at),
        metadata: {
          channel,
          senderName: data.authorization?.sender_name ?? null,
          senderBank: data.authorization?.sender_bank ?? null,
          senderAccount: data.authorization?.sender_bank_account_number ?? null,
        },
      });

      // Credit the wallet
      await this.walletService.creditWallet({
        walletId,
        amount: amountKobo,
        transactionId: tx.id,
        sourceAccountType: LedgerAccountType.PAYMENT_GATEWAY,
        description: `Top-up via ${this.channelLabel(channel)}`,
        qr,
      });

      await qr.commitTransaction();

      this.logger.log(
        `Wallet credited: ${amountKobo} kobo → wallet ${walletId} (ref: ${reference})`,
      );
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ─── transfer.success ────────────────────────────────────────────────────────

  /**
   * Fires when a Paystack transfer (withdrawal) completes successfully.
   * Updates the withdrawal request and the corresponding transaction to COMPLETED.
   * The funds were already debited at request time — no balance change needed here.
   */
  private async handleTransferSuccess(
    data: PaystackTransferEventData,
  ): Promise<void> {
    const { transfer_code, reference } = data;

    const withdrawal = await this.withdrawalRepo.findOne({
      where: { paymentTransferCode: transfer_code },
      relations: ['transaction'],
    });

    if (!withdrawal) {
      // Could be a transfer initiated outside the app — log and skip
      this.logger.warn(
        `transfer.success — no withdrawal found for transfer_code: ${transfer_code}`,
      );
      return;
    }

    if (withdrawal.status === WithdrawalStatus.COMPLETED) {
      this.logger.warn(
        `transfer.success — withdrawal ${withdrawal.id} already completed`,
      );
      return;
    }

    await this.withdrawalRepo.update(withdrawal.id, {
      status: WithdrawalStatus.COMPLETED,
    });

    if (withdrawal.transactionId) {
      await this.transactionRepo.update(withdrawal.transactionId, {
        status: TransactionStatus.COMPLETED,
        gatewayResponse: data as Record<string, any>,
        confirmedAt: new Date(data.transferred_at ?? data.updated_at),
      });
    }

    this.logger.log(
      `Withdrawal ${withdrawal.id} completed. Transfer code: ${transfer_code}`,
    );
  }

  // ─── transfer.failed ─────────────────────────────────────────────────────────

  /**
   * Fires when a Paystack transfer fails permanently.
   * We must reverse the debit — return funds to the user's available balance.
   *
   * Paystack returns funds to your Paystack balance automatically on failure.
   * We mirror this by crediting the user's wallet back.
   */
  private async handleTransferFailed(
    data: PaystackTransferEventData,
  ): Promise<void> {
    const { transfer_code } = data;

    const withdrawal = await this.withdrawalRepo.findOne({
      where: { paymentTransferCode: transfer_code },
      relations: ['transaction'],
    });

    if (!withdrawal) {
      this.logger.warn(
        `transfer.failed — no withdrawal found for transfer_code: ${transfer_code}`,
      );
      return;
    }

    if (withdrawal.status === WithdrawalStatus.FAILED) {
      this.logger.warn(
        `transfer.failed — already marked failed: ${withdrawal.id}`,
      );
      return;
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // Reverse the debit — return funds to user's wallet
      const reversalRef = `REV-${uuidv4().replace(/-/g, '').substring(0, 16).toUpperCase()}`;

      const reversalTx = await qr.manager.save(Transaction, {
        walletId: withdrawal.walletId,
        amount: withdrawal.amount,
        currency: 'NGN',
        type: TransactionType.REVERSAL,
        direction: TransactionDirection.CREDIT,
        status: TransactionStatus.COMPLETED,
        reference: reversalRef,
        description: `Reversal of failed withdrawal (${transfer_code})`,
        gatewayResponse: data as Record<string, any>,
        confirmedAt: new Date(),
        metadata: {
          originalWithdrawalId: withdrawal.id,
          transferCode: transfer_code,
        },
      });

      // Credit the wallet back from withdrawal transit
      await this.walletService.creditWallet({
        walletId: withdrawal.walletId,
        amount: withdrawal.amount,
        transactionId: reversalTx.id,
        sourceAccountType: LedgerAccountType.WITHDRAWAL_TRANSIT,
        description: `Failed transfer reversal — ${transfer_code}`,
        qr,
      });

      // Mark withdrawal as failed
      await qr.manager.update(WithdrawalRequest, withdrawal.id, {
        status: WithdrawalStatus.FAILED,
        failureReason: `Paystack transfer failed: ${data.reason ?? 'Unknown reason'}`,
      });

      // Mark original transaction as failed
      if (withdrawal.transactionId) {
        await qr.manager.update(Transaction, withdrawal.transactionId, {
          status: TransactionStatus.FAILED,
          failureReason: data.reason ?? 'Transfer failed at gateway',
          gatewayResponse: data as Record<string, any>,
        });
      }

      await qr.commitTransaction();

      this.logger.warn(
        `Withdrawal ${withdrawal.id} failed. ${withdrawal.amount} kobo returned to wallet ${withdrawal.walletId}`,
      );
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ─── transfer.reversed ───────────────────────────────────────────────────────

  /**
   * Fires when Paystack reverses a transfer after it appeared to succeed.
   * Extremely rare but must be handled — treat identically to transfer.failed.
   */
  private async handleTransferReversed(
    data: PaystackTransferEventData,
  ): Promise<void> {
    this.logger.warn(
      `Transfer reversed by Paystack: ${data.transfer_code}. Treating as failed.`,
    );
    await this.handleTransferFailed(data);
  }

  // ─── dedicatedaccount.assign.success ────────────────────────────────────────

  /**
   * Fires when Paystack finishes assigning a DVA to a customer.
   * DVA assignment is sometimes asynchronous — this confirms it completed.
   */
  private async handleDvaAssigned(data: Record<string, any>): Promise<void> {
    const customerCode = data.customer?.customer_code;
    if (!customerCode) return;

    const virtualAccount = await this.virtualAccountRepo.findOne({
      where: { paystackCustomerCode: customerCode },
    });

    if (!virtualAccount) {
      this.logger.warn(
        `dedicatedaccount.assign — no virtual account for customer ${customerCode}`,
      );
      return;
    }

    await this.virtualAccountRepo.update(virtualAccount.id, {
      isAssigned: true,
      accountNumber:
        data.dedicated_account?.account_number ?? virtualAccount.accountNumber,
      accountName:
        data.dedicated_account?.account_name ?? virtualAccount.accountName,
      paystackMeta: data,
    });

    this.logger.log(
      `DVA assignment confirmed for customer ${customerCode}: ${data.dedicated_account?.account_number}`,
    );
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private extractReference(event: string, data: Record<string, any>): string {
    // Each event type puts the unique reference in a different field
    if (event === PaystackWebhookEvent.CHARGE_SUCCESS) {
      return data.reference;
    }
    if (
      event === PaystackWebhookEvent.TRANSFER_SUCCESS ||
      event === PaystackWebhookEvent.TRANSFER_FAILED ||
      event === PaystackWebhookEvent.TRANSFER_REVERSED
    ) {
      return data.transfer_code ?? data.reference;
    }
    if (event === PaystackWebhookEvent.DEDICATEDACCOUNT_ASSIGN) {
      return data.customer?.customer_code ?? uuidv4();
    }
    return data.reference ?? data.id ?? uuidv4();
  }

  /**
   * Inserts a new webhook log row, or returns the existing one if already present.
   * Returns [log, isNew] — if isNew=false and isProcessed=true, skip processing.
   */
  private async upsertWebhookLog(
    event: string,
    reference: string,
    payload: Record<string, any>,
  ): Promise<[WebhookLog, boolean]> {
    const existing = await this.webhookLogRepo.findOne({
      where: { gatewayReference: reference },
    });

    if (existing) return [existing, false];

    const log = await this.webhookLogRepo.save(
      await this.webhookLogRepo.create({
        event,
        gatewayReference: reference,
        payload,
        isProcessed: false,
        retryCount: 0,
      }),
    );

    return [log, true];
  }

  private channelLabel(channel: string): string {
    const labels: Record<string, string> = {
      bank_transfer: 'Bank Transfer',
      dedicated_nuban: 'Dedicated Account',
      card: 'Card',
      ussd: 'USSD',
      qr: 'QR Code',
      mobile_money: 'Mobile Money',
    };
    return labels[channel] ?? channel;
  }
}
