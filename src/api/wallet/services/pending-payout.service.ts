import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryRunner, Repository, LessThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import {
  PendingPayout,
  PendingPayoutSource,
  PendingPayoutStatus,
} from '../entities/pending-payout.entity';
import { Wallet } from '../entities/wallet.entity';
import { WalletStatus } from '../enums/wallet.enum';
import { Transaction } from '../../transaction/entities/transaction.entity';
import {
  LedgerAccountType,
  TransactionDirection,
  TransactionStatus,
  TransactionType,
} from '../../transaction/enums/transaction.enum';
import { LedgerEntry } from '../../transaction/entities/ledger-entry.entity';
import { WalletService } from './wallet.service';
import { TermiiService } from '../../../common/services/termii.service';
import { WhatsAppService } from '../../../common/services/whatsapp.service';

// Funds parked for a participant who doesn't have an account yet.
// Created when a split bill is cancelled and a guest's share has been
// paid; the guest gets an SMS + WhatsApp invite to sign up, and the
// row is consumed the moment they verify the same phone number.
//
// 90-day expiry returns unclaimed funds to the original bill creator
// per project policy (see conversation 2026-05-17 with @creator).
@Injectable()
export class PendingPayoutService {
  private readonly logger = new Logger(PendingPayoutService.name);
  private static readonly EXPIRY_DAYS = 90;

  constructor(
    @InjectRepository(PendingPayout)
    private readonly payoutRepo: Repository<PendingPayout>,
    private readonly dataSource: DataSource,
    private readonly walletService: WalletService,
    private readonly termii: TermiiService,
    private readonly whatsapp: WhatsAppService,
    private readonly config: ConfigService,
  ) {}

  // ─── Helpers ───────────────────────────────────────────────

  // Phone normalisation matches what we store on User.phoneNumber so
  // the claim-on-signup lookup is deterministic. Strip every non-digit;
  // we don't enforce a country code because legacy users have inconsistent
  // formats and we want to err on the side of finding payouts.
  static normalisePhone(raw: string | null | undefined): string {
    if (!raw) return '';
    return raw.replace(/\D/g, '');
  }

  private buildSignupLink(phone: string): string {
    const base =
      this.config.get<string>('APP_BASE_URL')?.replace(/\/$/, '') ?? '';
    if (!base) return 'https://greyfundr.com';
    const enc = encodeURIComponent(phone);
    return `${base}/signup?phone=${enc}`;
  }

  // ─── Create on cancel ──────────────────────────────────────

  // Called from inside SplitBillService.cancelBill's transaction. We
  // accept the qr explicitly so the insert participates in the same
  // commit / rollback boundary as the wallet debits.
  async createForGuestCancel(params: {
    phone: string;
    amount: number;
    billId: string;
    participantId: string | null;
    originPayerUserId: string | null;
    billCreatorUserId: string;
    qr: QueryRunner;
  }): Promise<PendingPayout> {
    const phone = PendingPayoutService.normalisePhone(params.phone);
    if (!phone) {
      throw new BadRequestException(
        "Cannot create a pending payout without a phone number",
      );
    }
    if (!params.amount || params.amount <= 0) {
      throw new BadRequestException('Pending payout amount must be > 0');
    }
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() +
        PendingPayoutService.EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    );
    const row = params.qr.manager.create(PendingPayout, {
      phone,
      amount: params.amount,
      currency: 'NGN',
      source: PendingPayoutSource.SPLIT_BILL_CANCEL,
      sourceBillId: params.billId,
      sourceParticipantId: params.participantId,
      originPayerUserId: params.originPayerUserId,
      billCreatorUserId: params.billCreatorUserId,
      status: PendingPayoutStatus.PENDING,
      expiresAt,
    });
    return params.qr.manager.save(PendingPayout, row);
  }

  // ─── Notification ──────────────────────────────────────────

  // Fired out-of-band AFTER the cancel transaction has committed so a
  // notification failure can never roll back a real refund. Catches
  // and logs everything — never throws back up to the caller.
  async notify(payout: PendingPayout): Promise<void> {
    const phone = payout.phone;
    const formatted = new Intl.NumberFormat('en-NG', {
      maximumFractionDigits: 0,
    }).format(payout.amount);
    const amount = `₦${formatted}`;
    const link = this.buildSignupLink(phone);
    const sms =
      `Hi! You have ${amount} waiting on GreyFundr from a cancelled split bill. ` +
      `Sign up with this phone number to claim it: ${link}`;
    const meta: Record<string, unknown> = {};

    try {
      await this.termii.sendSMS(phone, sms);
      meta.sms = 'ok';
    } catch (err) {
      meta.sms = `failed: ${(err as Error)?.message ?? 'unknown'}`;
      this.logger.warn(
        `[PendingPayout ${payout.id}] SMS to ${phone} failed: ${(err as Error)?.message}`,
      );
    }

    try {
      const res = await this.whatsapp.sendTemplate(
        phone,
        `${amount} is waiting for you on GreyFundr`,
        `A split bill you were on got cancelled. Sign up with this phone number to claim your refund: ${link}`,
      );
      meta.whatsapp = res.success ? `ok:${res.messageId ?? ''}` : `failed:${res.error}`;
    } catch (err) {
      meta.whatsapp = `failed: ${(err as Error)?.message ?? 'unknown'}`;
      this.logger.warn(
        `[PendingPayout ${payout.id}] WhatsApp to ${phone} failed: ${(err as Error)?.message}`,
      );
    }

    try {
      payout.notifiedAt = new Date();
      payout.notificationMeta = meta;
      await this.payoutRepo.save(payout);
    } catch (err) {
      this.logger.error(
        `[PendingPayout ${payout.id}] failed to persist notify meta: ${(err as Error)?.message}`,
      );
    }
  }

  // ─── Claim on signup / phone verify ────────────────────────

  // Called from auth flow after a user's phone is known to be
  // genuinely theirs (post-signup OR post-OTP verification). Drops
  // every PENDING payout for the phone into the wallet in a single
  // transaction. Returns the total credited so the caller can surface
  // a "you received ₦X" banner.
  async claimForUser(userId: string, rawPhone: string): Promise<number> {
    const phone = PendingPayoutService.normalisePhone(rawPhone);
    if (!phone) return 0;

    const pending = await this.payoutRepo.find({
      where: { phone, status: PendingPayoutStatus.PENDING },
    });
    if (pending.length === 0) return 0;

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const wallet = await qr.manager.findOne(Wallet, { where: { userId } });
      if (!wallet) {
        throw new NotFoundException(
          'Wallet not found for user — cannot claim pending payouts',
        );
      }
      if (wallet.status !== WalletStatus.ACTIVE) {
        throw new BadRequestException('Wallet is not active');
      }

      let totalCredited = 0;
      for (const p of pending) {
        // Race guard: another concurrent claim might have flipped the
        // status. Re-fetch with a row lock and skip if it's no longer
        // PENDING.
        const locked = await qr.manager
          .createQueryBuilder(PendingPayout, 'pp')
          .setLock('pessimistic_write')
          .where('pp.id = :id', { id: p.id })
          .getOne();
        if (!locked || locked.status !== PendingPayoutStatus.PENDING) continue;

        const tx = qr.manager.create(Transaction, {
          userId,
          walletId: wallet.id,
          type: TransactionType.REVERSAL,
          status: TransactionStatus.COMPLETED,
          direction: TransactionDirection.CREDIT,
          amount: Number(locked.amount),
          currency: 'NGN',
          description: `Refund from cancelled split bill (claimed at signup)`,
          metadata: {
            pendingPayoutId: locked.id,
            sourceBillId: locked.sourceBillId,
            kind: 'pending_payout_claim',
          },
        } as Partial<Transaction>);
        const savedTx = await qr.manager.save(Transaction, tx);

        await this.walletService.creditWallet({
          walletId: wallet.id,
          amount: Number(locked.amount),
          transactionId: savedTx.id,
          sourceAccountType: LedgerAccountType.BILL_ESCROW,
          sourceEntityId: locked.sourceBillId,
          description: 'Pending refund claimed on signup',
          qr,
        });

        locked.status = PendingPayoutStatus.CLAIMED;
        locked.claimedAt = new Date();
        locked.claimedByUserId = userId;
        await qr.manager.save(PendingPayout, locked);

        totalCredited += Number(locked.amount);
      }

      await qr.commitTransaction();
      this.logger.log(
        `[PendingPayout] Claimed ${pending.length} payouts (₦${totalCredited}) for user ${userId}`,
      );
      return totalCredited;
    } catch (err) {
      await qr.rollbackTransaction();
      this.logger.error(
        `[PendingPayout] claimForUser failed for ${userId}: ${(err as Error)?.message}`,
      );
      return 0;
    } finally {
      await qr.release();
    }
  }

  // ─── 90-day expiry sweep ───────────────────────────────────

  // Runs daily at 03:00 (server time). Returns unclaimed funds to
  // each bill's creator wallet so dormant balances don't accumulate.
  // We deliberately do NOT batch into a single transaction — each
  // payout is its own commit so a single bad row can't poison the
  // whole sweep.
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async runExpirySweep(): Promise<void> {
    const now = new Date();
    const expired = await this.payoutRepo.find({
      where: {
        status: PendingPayoutStatus.PENDING,
        expiresAt: LessThan(now),
      },
      take: 200, // cap per run; next day's run picks up the rest
    });
    if (expired.length === 0) return;
    this.logger.log(
      `[PendingPayout] Expiry sweep: ${expired.length} rows to return`,
    );
    for (const p of expired) {
      try {
        await this.returnToBillCreator(p);
      } catch (err) {
        this.logger.error(
          `[PendingPayout ${p.id}] return-to-creator failed: ${(err as Error)?.message}`,
        );
      }
    }
  }

  // Internal — credits the bill creator's wallet with the unclaimed
  // amount and marks the row RETURNED. Used by the cron only.
  private async returnToBillCreator(payout: PendingPayout): Promise<void> {
    if (!payout.billCreatorUserId) {
      // No-one to return to; mark EXPIRED so the sweep stops touching it.
      await this.payoutRepo.update(payout.id, {
        status: PendingPayoutStatus.EXPIRED,
      });
      return;
    }
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const locked = await qr.manager
        .createQueryBuilder(PendingPayout, 'pp')
        .setLock('pessimistic_write')
        .where('pp.id = :id', { id: payout.id })
        .getOne();
      if (!locked || locked.status !== PendingPayoutStatus.PENDING) {
        await qr.rollbackTransaction();
        return;
      }
      const wallet = await qr.manager.findOne(Wallet, {
        where: { userId: locked.billCreatorUserId! },
      });
      if (!wallet) {
        locked.status = PendingPayoutStatus.EXPIRED;
        await qr.manager.save(PendingPayout, locked);
        await qr.commitTransaction();
        return;
      }
      const tx = qr.manager.create(Transaction, {
        userId: locked.billCreatorUserId!,
        walletId: wallet.id,
        type: TransactionType.REVERSAL,
        status: TransactionStatus.COMPLETED,
        direction: TransactionDirection.CREDIT,
        amount: Number(locked.amount),
        currency: 'NGN',
        description: 'Unclaimed cancelled-bill refund returned',
        metadata: {
          pendingPayoutId: locked.id,
          sourceBillId: locked.sourceBillId,
          kind: 'pending_payout_returned',
        },
      } as Partial<Transaction>);
      const savedTx = await qr.manager.save(Transaction, tx);
      await this.walletService.creditWallet({
        walletId: wallet.id,
        amount: Number(locked.amount),
        transactionId: savedTx.id,
        sourceAccountType: LedgerAccountType.BILL_ESCROW,
        sourceEntityId: locked.sourceBillId,
        description: 'Pending payout expired — returned to bill creator',
        qr,
      });
      locked.status = PendingPayoutStatus.RETURNED;
      locked.returnedAt = new Date();
      await qr.manager.save(PendingPayout, locked);
      await qr.commitTransaction();
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
    // Silence unused-var lint
    void LedgerEntry;
  }
}
