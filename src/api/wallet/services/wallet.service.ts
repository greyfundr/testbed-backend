import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  Wallet,
  VirtualAccount,
  BankAccount,
  WithdrawalRequest,
  WithdrawalStatus,
} from '../entities';
import {
  Transaction,
  LedgerEntry,
  WebhookLog,
} from '../../transaction/entities';
import {
  WalletStatus,
  WalletCurrency,
  VirtualAccountStatus,
} from '../enums/wallet.enum';
import {
  TransactionType,
  TransactionStatus,
  TransactionDirection,
  LedgerAccountType,
} from '../../transaction/enums/transaction.enum';
import { User } from '../../user/entities';
import {
  AddBankAccountDto,
  WithdrawDto,
  SetTransactionPinDto,
  ChangeTransactionPinDto,
} from '../dto';
import { UserRepository } from '../../user/repository';
import {
  VirtualAccountRepository,
  WalletRepository,
  BankAccountRepository,
  WithdrawalRequestRepository,
} from '../repository';
import {
  LedgerEntryRepository,
  TransactionRepository,
} from '../../transaction/repository';
import { PaymentService } from '../../payment/services';
import axios from 'axios';
import { FundingAccountResponse, InitiateFundingResponse } from '../interfaces';
import * as bcrypt from 'bcrypt';

interface CreditParams {
  walletId: string;
  amount: number; // Naira
  transactionId: string;
  sourceAccountType: LedgerAccountType;
  sourceEntityId?: string;
  description: string;
  qr: QueryRunner;
}

interface DebitParams {
  walletId: string;
  amount: number; // Naira
  transactionId: string;
  targetAccountType: LedgerAccountType;
  targetEntityId?: string;
  description: string;
  qr: QueryRunner;
}

interface LockEscrowParams {
  walletId: string;
  amount: number;
  transactionId: string;
  entityType: 'campaign' | 'split_bill' | 'invoice' | 'event';
  entityId: string;
  description: string;
  qr: QueryRunner;
}

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  private readonly MIN_FUNDING_NAIRA = 100.0;
  private readonly MAX_FUNDING_NAIRA = 10_000_000.0;
  private readonly TRIVIAL_PINS = new Set([
    '0000',
    '1111',
    '2222',
    '3333',
    '4444',
    '5555',
    '6666',
    '7777',
    '8888',
    '9999',
    '1234',
    '4321',
    '0123',
    '9876',
  ]);
  private readonly MAX_PIN_ATTEMPTS = 5;
  private readonly PIN_LOCK_MINUTES = 15;

  constructor(
    private readonly userRepository: UserRepository,
    private readonly walletRepository: WalletRepository,
    private readonly virtualAccountRepository: VirtualAccountRepository,
    private readonly transactionRepository: TransactionRepository,
    private readonly ledgerEntryRepository: LedgerEntryRepository,
    private readonly withdrawalRequestRepository: WithdrawalRequestRepository,
    private readonly bankAccountRepository: BankAccountRepository,
    private readonly paymentService: PaymentService,
    private readonly dataSource: DataSource,
  ) {}

  // ─── Wallet Creation ─────────────────────────────────────────────────────────

  /**
   * Creates a wallet for a newly registered user.
   * Called automatically inside a transaction during user signup — never call
   * directly from a controller.
   *
   * Does NOT provision a Paystack customer or DVA here. That happens at KYC
   * completion, because Paystack requires a verified name (NIN/BVN) for DVA.
   */
  async createWalletForUser(
    user: Pick<User, 'id'>,
    qr: QueryRunner,
  ): Promise<Wallet> {
    const existing = await qr.manager.findOne(Wallet, {
      where: { userId: user.id },
    });

    if (existing) {
      this.logger.warn(`Wallet already exists for user ${user.id}`);
      return existing;
    }

    const wallet = qr.manager.create(Wallet, {
      userId: user.id,
      availableBalance: 0,
      ledgerBalance: 0,
      escrowBalance: 0,
      lifetimeCredited: 0,
      lifetimeDebited: 0,
      currency: WalletCurrency.NGN,
      status: WalletStatus.ACTIVE,
      version: 0,
    });

    return qr.manager.save(Wallet, wallet);
  }

  /**
   * Provisions a Paystack customer + Dedicated Virtual Account after KYC.
   * Idempotent — safe to retry if DVA assignment is still pending.
   */
  async provisionVirtualAccount(userId: string): Promise<VirtualAccount> {
    const existing = await this.virtualAccountRepository
      .createQueryBuilder('va')
      .innerJoin('va.wallet', 'w', 'w.user_id = :userId', { userId })
      .getOne();

    if (existing?.isAssigned) return existing;

    const wallet = await this.getWalletByUserId(userId);

    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['settings'],
    });

    if (!user) throw new NotFoundException('User not found');

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const customer = await this.paymentService.createCustomer({
        email: user.email,
        firstName: user.firstName ?? '',
        lastName: user.lastName ?? '',
        phone: user.phoneNumber,
      });

      const bank =
        process.env.NODE_ENV === 'development' ? 'test-bank' : 'wema-bank';

      const dva = await this.paymentService.createDedicatedVirtualAccount({
        customer: customer.customer_code,
        preferredBank: bank,
      });

      const virtualAccount = qr.manager.create(VirtualAccount, {
        walletId: wallet.id,
        accountNumber: dva.account_number,
        accountName: dva.account_name,
        bankName: dva.bank.name,
        bankCode: String(dva.bank.id),
        paystackCustomerId: String(customer.id),
        paystackCustomerCode: customer.customer_code,
        paystackDvaId: String(dva.id),
        isAssigned: dva.assigned,
        status: VirtualAccountStatus.ACTIVE,
        paystackMeta: dva,
      });

      await qr.manager.save(VirtualAccount, virtualAccount);
      await qr.commitTransaction();

      this.logger.log(
        `Provisioned DVA ${dva.account_number} for user ${userId}`,
      );

      return virtualAccount;
    } catch (err) {
      await qr.rollbackTransaction();
      this.logger.error(`Failed to provision DVA for user ${userId}`, err);
      throw err;
    } finally {
      await qr.release();
    }
  }

  async getWalletByUserId(userId: string): Promise<Wallet> {
    const wallet = await this.walletRepository.findOne({
      where: { user: { id: userId } },
      relations: ['virtualAccount'],
    });

    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }

  async getWalletById(walletId: string): Promise<Wallet> {
    const wallet = await this.walletRepository.findOne({
      where: { id: walletId },
    });

    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }

  async getWalletBalance(userId: string): Promise<{
    available: number;
    ledger: number;
    escrow: number;
    currency: string;
  }> {
    const wallet = await this.getWalletByUserId(userId);
    return {
      available: wallet.availableBalance,
      ledger: wallet.ledgerBalance,
      escrow: wallet.escrowBalance,
      currency: wallet.currency,
    };
  }

  async getFundingAccount(userId: string): Promise<FundingAccountResponse> {
    const wallet = await this.getWalletByUserId(userId);

    const virtualAccount = await this.virtualAccountRepository.findOne({
      where: { walletId: wallet.id },
    });

    if (!virtualAccount) {
      return {
        accountNumber: '',
        accountName: '',
        bankName: '',
        bankCode: '',
        isAssigned: false,
        provisioningPending: false,
      };
    }

    if (!virtualAccount.isAssigned) {
      await this.syncDvaAssignmentStatus(virtualAccount);

      return {
        accountNumber: virtualAccount.accountNumber,
        accountName: virtualAccount.accountName,
        bankName: virtualAccount.bankName,
        bankCode: virtualAccount.bankCode,
        isAssigned: virtualAccount.isAssigned,
        provisioningPending: true,
      };
    }

    return {
      accountNumber: virtualAccount.accountNumber,
      accountName: virtualAccount.accountName,
      bankName: virtualAccount.bankName,
      bankCode: virtualAccount.bankCode,
      isAssigned: true,
      provisioningPending: false,
    };
  }

  /**
   * Polls Paystack for the latest DVA assignment status.
   * Called when we have a DVA record but isAssigned is still false.
   * Silently updates the record — never throws, this is a best-effort sync.
   */
  private async syncDvaAssignmentStatus(va: VirtualAccount): Promise<void> {
    try {
      if (!va.paystackDvaId) return;

      const latest = await this.paymentService.getDedicatedVirtualAccount(
        va.paystackDvaId,
      );

      if (latest.assigned && !va.isAssigned) {
        await this.virtualAccountRepository.update(va.id, {
          isAssigned: true,
          accountNumber: latest.account_number,
          accountName: latest.account_name,
          paystackMeta: latest,
        });

        va.isAssigned = true;
        va.accountNumber = latest.account_number;
        va.accountName = latest.account_name;

        this.logger.log(
          `DVA assignment synced for virtual account ${va.id}: ${latest.account_number}`,
        );
      }
    } catch (err) {
      this.logger.warn(`DVA sync failed for ${va.id}: ${err?.message}`);
    }
  }

  /**
   * Initiates a card or bank charge top-up via Paystack Standard.
   * Returns an authorization URL — redirect the user to this URL.
   * The actual wallet credit happens when Paystack fires charge.success webhook.
   *
   * This is the secondary funding path for users who prefer card over bank transfer.
   */
  async initiateWalletFunding(
    userId: string,
    amountNaira: number,
  ): Promise<InitiateFundingResponse> {
    if (amountNaira < this.MIN_FUNDING_NAIRA) {
      throw new BadRequestException(
        `Minimum top-up is ₦${this.MIN_FUNDING_NAIRA}`,
      );
    }
    if (amountNaira > this.MAX_FUNDING_NAIRA) {
      throw new BadRequestException(
        `Maximum top-up is ₦${this.MAX_FUNDING_NAIRA}`,
      );
    }

    const wallet = await this.getWalletByUserId(userId);

    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'email', 'firstName', 'lastName'],
    });

    if (!user) throw new NotFoundException('User not found');

    const reference = `CF-${uuidv4().replace(/-/g, '').substring(0, 20).toUpperCase()}`;

    await this.transactionRepository.save(
      await this.transactionRepository.create({
        walletId: wallet.id,
        amount: amountNaira,
        currency: 'NGN',
        type: TransactionType.WALLET_FUNDING,
        direction: TransactionDirection.CREDIT,
        status: TransactionStatus.PENDING,
        reference,
        description: 'Wallet top-up via card',
        metadata: { initiatedBy: 'card_funding', userId },
      }),
    );

    // Initialize Paystack transaction
    const data = await this.paymentService.initiateTransactions({
      email: user.email,
      reference,
      amount: Math.round(amountNaira * 100),
      metadata: {
        wallet_id: wallet.id,
        user_id: userId,
        type: 'wallet_funding',
        purpose: 'wallet_funding',
        custom_fields: [
          {
            display_name: 'Purpose',
            variable_name: 'p3urpose',
            value: 'Wallet Top-up',
          },
        ],
      },
    });

    if (!data.status) {
      await this.transactionRepository.update(
        { reference },
        { status: TransactionStatus.FAILED, failureReason: data.message },
      );
      throw new BadRequestException(
        `Payment initialization failed: ${data.message}`,
      );
    }

    this.logger.log(
      `Card funding initiated: ${reference} — ₦${amountNaira} for wallet ${wallet.id}`,
    );

    return {
      reference,
      authorizationUrl: data.data.authorization_url,
      accessCode: data.data.access_code,
      amount: amountNaira,
      currency: 'NGN',
      channel: ['card', 'bank', 'ussd', 'bank_transfer'],
    };
  }

  /**
   * Manual verification fallback — called when user returns from Paystack
   * redirect and the webhook may not have fired yet (or at all).
   *
   * This does NOT duplicate the webhook handler's work:
   *   - If the webhook already processed this reference → transaction is COMPLETED,
   *     wallet is already credited → return success immediately, no double-credit.
   *   - If the webhook hasn't fired yet → verify with Paystack directly and
   *     credit the wallet ourselves, then mark so the webhook skips it.
   */
  async verifyAndCreditFunding(
    userId: string,
    reference: string,
  ): Promise<{ status: string; credited: boolean; amount: number }> {
    const wallet = await this.getWalletByUserId(userId);

    const tx = await this.transactionRepository.findOne({
      where: { reference, walletId: wallet.id },
    });

    if (!tx) {
      throw new NotFoundException(
        'Transaction not found. Ensure the reference belongs to your account.',
      );
    }

    if (tx.status === TransactionStatus.COMPLETED) {
      return { status: 'success', credited: false, amount: tx.amount };
    }

    if (tx.status === TransactionStatus.FAILED) {
      return { status: 'failed', credited: false, amount: tx.amount };
    }

    let paystackData: any;
    try {
      paystackData = await this.paymentService.verifyTransaction(reference);
    } catch {
      await this.transactionRepository.update(tx.id, {
        status: TransactionStatus.FAILED,
        failureReason: 'Payment not completed on Paystack',
      });
      return { status: 'failed', credited: false, amount: tx.amount };
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const claim = await qr.manager
        .createQueryBuilder()
        .update(Transaction)
        .set({
          status: TransactionStatus.PROCESSING,
          gatewayReference: paystackData.reference,
          paymentGateway: 'paystack',
          gatewayResponse: paystackData,
          confirmedAt: new Date(paystackData.paid_at ?? Date.now()),
        })
        .where('id = :id AND status = :status', {
          id: tx.id,
          status: TransactionStatus.PENDING,
        })
        .execute();

      if (claim.affected === 0) {
        await qr.rollbackTransaction();
        return { status: 'success', credited: false, amount: tx.amount };
      }

      await this.creditWallet({
        walletId: wallet.id,
        amount: tx.amount,
        transactionId: tx.id,
        sourceAccountType: LedgerAccountType.PAYMENT_GATEWAY,
        description: `Card top-up (verified) — ${reference}`,
        qr,
      });

      await qr.manager.update(Transaction, tx.id, {
        status: TransactionStatus.COMPLETED,
      });

      await qr.manager.upsert(
        WebhookLog,
        {
          gatewayReference: reference,
          event: 'charge.success',
          payload: paystackData,
          isProcessed: true,
          processedAt: new Date(),
          retryCount: 0,
        },
        ['paystackReference'],
      );

      await qr.commitTransaction();

      this.logger.log(
        `Card funding verified manually: ${reference} — ₦${tx.amount} credited to wallet ${wallet.id}`,
      );

      return { status: 'success', credited: true, amount: tx.amount };
    } catch (err) {
      await qr.rollbackTransaction();
      this.logger.error(
        `Manual funding verification failed for ${reference}`,
        err,
      );
      throw err;
    } finally {
      await qr.release();
    }
  }

  async getFundingHistory(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: Transaction[]; total: number; page: number }> {
    const wallet = await this.getWalletByUserId(userId);

    const [data, total] = await this.transactionRepository
      .createQueryBuilder('tx')
      .where('tx.wallet_id = :walletId', { walletId: wallet.id })
      .andWhere('tx.type = :type', { type: TransactionType.WALLET_FUNDING })
      .orderBy('tx.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page };
  }

  // ─── Core Ledger Operations ──────────────────────────────────────────────────

  /**
   * Credits a wallet. MUST be called inside an active QueryRunner transaction.
   * Records two ledger entries: debit the source account, credit the wallet.
   */
  async creditWallet(params: CreditParams): Promise<void> {
    const {
      walletId,
      amount,
      transactionId,
      sourceAccountType,
      sourceEntityId,
      description,
      qr,
    } = params;

    // Atomic increment — no SELECT needed, eliminates race conditions
    const result = await qr.manager
      .createQueryBuilder()
      .update(Wallet)
      .set({
        availableBalance: () => `available_balance + ${amount}`,
        ledgerBalance: () => `ledger_balance + ${amount}`,
        lifetimeCredited: () => `lifetime_credited + ${amount}`,
      })
      .where('id = :id AND status = :status', {
        id: walletId,
        status: WalletStatus.ACTIVE,
      })
      .execute();

    if (result.affected === 0) {
      throw new ForbiddenException('Wallet is not active — credit rejected');
    }

    // Snapshot running balance for statement
    const wallet = await qr.manager
      .createQueryBuilder(Wallet, 'w')
      .select('w.available_balance')
      .where('w.id = :id', { id: walletId })
      .getOne();

    // Ledger entry 1: credit the user wallet
    await qr.manager.save(LedgerEntry, {
      transactionId,
      walletId,
      accountType: LedgerAccountType.USER_WALLET,
      direction: TransactionDirection.CREDIT,
      amount: amount,
      currency: 'NGN',
      runningBalance: wallet?.availableBalance ?? null,
      description,
    });

    await qr.manager.save(LedgerEntry, {
      transactionId,
      walletId: null,
      accountType: sourceAccountType,
      accountEntityId: sourceEntityId ?? null,
      direction: TransactionDirection.DEBIT,
      amount: amount,
      currency: 'NGN',
      runningBalance: null,
      description,
    });
  }

  /**
   * Debits a wallet. MUST be called inside an active QueryRunner transaction.
   * Atomically checks balance sufficiency and decrements — cannot overdraft.
   */
  async debitWallet(params: DebitParams): Promise<void> {
    const {
      walletId,
      amount,
      transactionId,
      targetAccountType,
      targetEntityId,
      description,
      qr,
    } = params;

    if (amount <= 0)
      throw new BadRequestException('Debit amount must be positive');

    // Single atomic UPDATE that self-guards against overdraft
    const result = await qr.manager
      .createQueryBuilder()
      .update(Wallet)
      .set({
        availableBalance: () => `available_balance - ${amount}`,
        ledgerBalance: () => `ledger_balance - ${amount}`,
        lifetimeDebited: () => `lifetime_debited + ${amount}`,
      })
      .where('id = :id AND status = :status AND available_balance >= :amount', {
        id: walletId,
        status: WalletStatus.ACTIVE,
        amount,
      })
      .execute();

    if (result.affected === 0) {
      // Distinguish between "wallet frozen" and "insufficient balance"
      const wallet = await qr.manager.findOne(Wallet, {
        where: { id: walletId },
      });
      if (!wallet) throw new NotFoundException('Wallet not found');
      if (wallet.status !== WalletStatus.ACTIVE)
        throw new ForbiddenException(`Wallet is ${wallet.status}`);
      throw new BadRequestException(
        `Insufficient balance. Available: ₦${wallet.availableBalance}, Required: ₦${amount}`,
      );
    }

    const wallet = await qr.manager
      .createQueryBuilder(Wallet, 'w')
      .select('w.available_balance')
      .where('w.id = :id', { id: walletId })
      .getOne();

    await qr.manager.save(LedgerEntry, {
      transactionId,
      walletId,
      accountType: LedgerAccountType.USER_WALLET,
      direction: TransactionDirection.DEBIT,
      amount: amount,
      currency: 'NGN',
      runningBalance: wallet?.availableBalance ?? null,
      description,
    });

    await qr.manager.save(LedgerEntry, {
      transactionId,
      walletId: null,
      accountType: targetAccountType,
      accountEntityId: targetEntityId ?? null,
      direction: TransactionDirection.CREDIT,
      amount: amount,
      currency: 'NGN',
      runningBalance: null,
      description,
    });
  }

  /**
   * Moves funds from available balance into escrow (locked for a campaign/bill).
   * The money stays in the wallet but is no longer spendable.
   * Double-entry: USER_WALLET debit ↔ CAMPAIGN_ESCROW or BILL_ESCROW credit.
   */
  async lockIntoEscrow(params: LockEscrowParams): Promise<void> {
    const {
      walletId,
      amount,
      transactionId,
      entityType,
      entityId,
      description,
      qr,
    } = params;

    const escrowAccountType =
      entityType === 'campaign'
        ? LedgerAccountType.CAMPAIGN_ESCROW
        : entityType === 'split_bill'
          ? LedgerAccountType.BILL_ESCROW
          : entityType === 'event'
            ? LedgerAccountType.EVENT_ESCROW
            : LedgerAccountType.BILL_ESCROW; // invoices use bill escrow

    // Atomically: decrement available, increment escrow
    const result = await qr.manager
      .createQueryBuilder()
      .update(Wallet)
      .set({
        availableBalance: () => `available_balance - ${amount}`,
        ledgerBalance: () => `ledger_balance - ${amount}`,
        escrowBalance: () => `escrow_balance + ${amount}`,
        lifetimeDebited: () => `lifetime_debited + ${amount}`,
      })
      .where('id = :id AND status = :status AND available_balance >= :amount', {
        id: walletId,
        status: WalletStatus.ACTIVE,
        amount,
      })
      .execute();

    if (result.affected === 0) {
      const wallet = await qr.manager.findOne(Wallet, {
        where: { id: walletId },
      });
      if (!wallet) throw new NotFoundException('Wallet not found');
      if (wallet.status !== WalletStatus.ACTIVE)
        throw new ForbiddenException(`Wallet is ${wallet.status}`);

      // throw new BadRequestException(
      //   `Insufficient available balance for escrow. Available: ${wallet.availableBalance} kobo`,
      // );
    }

    const wallet = await qr.manager
      .createQueryBuilder(Wallet, 'w')
      .select(['w.available_balance', 'w.escrow_balance'])
      .where('w.id = :id', { id: walletId })
      .getOne();

    await qr.manager.save(LedgerEntry, {
      transactionId,
      walletId,
      accountType: LedgerAccountType.USER_WALLET,
      direction: TransactionDirection.DEBIT,
      amount: amount,
      currency: 'NGN',
      runningBalance: wallet?.availableBalance ?? null,
      description,
    });

    await qr.manager.save(LedgerEntry, {
      transactionId,
      walletId: null,
      accountType: escrowAccountType,
      accountEntityId: entityId,
      direction: TransactionDirection.CREDIT,
      amount: amount,
      currency: 'NGN',
      runningBalance: null,
      description,
    });
  }

  /**
   * Releases escrow funds to a recipient wallet (campaign settled, bill paid).
   * Decrements escrow counter and credits recipient's available balance.
   * netAmount = amount - feeAmount (platform fee already separated).
   */
  async releaseEscrowToWallet(params: {
    escrowHolderWalletId: string; // wallet that held the escrow funds
    recipientWalletId: string;
    grossAmount: number; // total escrowed (Naira)
    feeAmount: number; // platform fee (Naira)
    transactionId: string;
    entityType: 'campaign' | 'split_bill' | 'invoice';
    entityId: string;
    description: string;
    qr: QueryRunner;
  }): Promise<void> {
    const {
      escrowHolderWalletId,
      recipientWalletId,
      grossAmount,
      feeAmount,
      transactionId,
      entityType,
      entityId,
      description,
      qr,
    } = params;

    const netAmount = grossAmount - feeAmount;
    const escrowAccountType =
      entityType === 'campaign'
        ? LedgerAccountType.CAMPAIGN_ESCROW
        : LedgerAccountType.BILL_ESCROW;

    // 1. Decrement escrow balance on source wallet
    await qr.manager
      .createQueryBuilder()
      .update(Wallet)
      .set({
        escrowBalance: () => `escrow_balance - ${grossAmount}`,
      })
      .where('id = :id', { id: escrowHolderWalletId })
      .execute();

    // 2. Debit escrow account (ledger)
    await qr.manager.save(LedgerEntry, {
      transactionId,
      walletId: null,
      accountType: escrowAccountType,
      accountEntityId: entityId,
      direction: TransactionDirection.DEBIT,
      amount: grossAmount,
      currency: 'NGN',
      runningBalance: null,
      description: `${description} [escrow release]`,
    });

    // 3. Credit net amount to recipient wallet
    const creditResult = await qr.manager
      .createQueryBuilder()
      .update(Wallet)
      .set({
        availableBalance: () => `available_balance + ${netAmount}`,
        ledgerBalance: () => `ledger_balance + ${netAmount}`,
        lifetimeCredited: () => `lifetime_credited + ${netAmount}`,
      })
      .where('id = :id', { id: recipientWalletId })
      .execute();

    if (creditResult.affected === 0) {
      throw new NotFoundException('Recipient wallet not found');
    }

    const recipient = await qr.manager
      .createQueryBuilder(Wallet, 'w')
      .select('w.available_balance')
      .where('w.id = :id', { id: recipientWalletId })
      .getOne();

    await qr.manager.save(LedgerEntry, {
      transactionId,
      walletId: recipientWalletId,
      accountType: LedgerAccountType.USER_WALLET,
      accountEntityId: null,
      direction: TransactionDirection.CREDIT,
      amount: netAmount,
      currency: 'NGN',
      runningBalance: recipient?.availableBalance ?? null,
      description: `${description} [net credit]`,
    });

    // 4. If there's a fee, credit platform revenue account
    if (feeAmount > 0) {
      await qr.manager.save(LedgerEntry, {
        transactionId,
        walletId: null,
        accountType: LedgerAccountType.PLATFORM_REVENUE,
        accountEntityId: null,
        direction: TransactionDirection.CREDIT,
        amount: feeAmount,
        currency: 'NGN',
        runningBalance: null,
        description: `Platform fee for ${entityType} ${entityId}`,
      });
    }
  }

  /**
   * Refunds escrowed funds back to a backer wallet (failed/expired campaign).
   * Mirrors lockIntoEscrow in reverse.
   */
  async refundEscrowToWallet(params: {
    backerWalletId: string;
    amount: number;
    transactionId: string;
    entityType: 'campaign' | 'split_bill';
    entityId: string;
    description: string;
    qr: QueryRunner;
  }): Promise<void> {
    const {
      backerWalletId,
      amount,
      transactionId,
      entityType,
      entityId,
      description,
      qr,
    } = params;

    const escrowAccountType =
      entityType === 'campaign'
        ? LedgerAccountType.CAMPAIGN_ESCROW
        : LedgerAccountType.BILL_ESCROW;

    // 1. Restore available balance, reduce escrow balance
    await qr.manager
      .createQueryBuilder()
      .update(Wallet)
      .set({
        availableBalance: () => `available_balance + ${amount}`,
        ledgerBalance: () => `ledger_balance + ${amount}`,
        lifetimeCredited: () => `lifetime_credited + ${amount}`,
        escrowBalance: () => `GREATEST(escrow_balance - ${amount}, 0)`,
      })
      .where('id = :id', { id: backerWalletId })
      .execute();

    const wallet = await qr.manager
      .createQueryBuilder(Wallet, 'w')
      .select('w.available_balance')
      .where('w.id = :id', { id: backerWalletId })
      .getOne();

    await qr.manager.save(LedgerEntry, {
      transactionId,
      walletId: null,
      accountType: escrowAccountType,
      accountEntityId: entityId,
      direction: TransactionDirection.DEBIT,
      amount,
      currency: 'NGN',
      runningBalance: null,
      description: `${description} [escrow refund]`,
    });

    await qr.manager.save(LedgerEntry, {
      transactionId,
      walletId: backerWalletId,
      accountType: LedgerAccountType.USER_WALLET,
      direction: TransactionDirection.CREDIT,
      amount,
      currency: 'NGN',
      runningBalance: wallet?.availableBalance ?? null,
      description,
    });
  }

  // ─── Bank Accounts ───────────────────────────────────────────────────────────

  async addBankAccount(
    userId: string,
    dto: AddBankAccountDto,
  ): Promise<BankAccount> {
    // Verify account exists via Paystack name enquiry
    const resolved = await this.paymentService.resolveAccountNumber({
      accountNumber: dto.accountNumber,
      bankCode: dto.bankCode,
    });

    // Create Paystack transfer recipient (reuse for all future withdrawals)
    const recipient = await this.paymentService.createTransferRecipient({
      name: resolved.account_name,
      accountNumber: dto.accountNumber,
      bankCode: dto.bankCode,
    });

    // If user is setting this as default, unset previous default
    if (dto.isDefault) {
      await this.bankAccountRepository.update(
        { userId, isDefault: true },
        { isDefault: false },
      );
    }

    const isFirst =
      (await this.bankAccountRepository.findAll({ where: { userId } }))
        .length === 0;

    const bankAccount = await this.bankAccountRepository.create({
      userId,
      accountNumber: dto.accountNumber,
      accountName: resolved.account_name,
      bankName: dto.bankName,
      bankCode: dto.bankCode,
      recipientCode: recipient.recipient_code,
      isDefault: dto.isDefault ?? isFirst,
      isActive: true,
      isVerified: true,
    });

    return this.bankAccountRepository.save(bankAccount);
  }

  async getUserBankAccounts(userId: string): Promise<BankAccount[]> {
    return this.bankAccountRepository.findAll({
      where: { userId, isActive: true },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
  }

  async removeBankAccount(
    userId: string,
    bankAccountId: string,
  ): Promise<void> {
    const account = await this.bankAccountRepository.findOne({
      where: { id: bankAccountId, userId },
    });
    if (!account) throw new NotFoundException('Bank account not found');
    await this.bankAccountRepository.update(account.id, { isActive: false });
  }

  // ─── Withdrawals ─────────────────────────────────────────────────────────────

  async requestWithdrawal(
    userId: string,
    dto: WithdrawDto,
  ): Promise<WithdrawalRequest> {
    await this.verifyTransactionPin(userId, dto.transactionPin);

    const wallet = await this.getWalletByUserId(userId);

    if (wallet.status !== WalletStatus.ACTIVE) {
      throw new ForbiddenException(
        `Wallet is ${wallet.status}. Cannot withdraw.`,
      );
    }

    if (wallet.availableBalance < dto.amount) {
      throw new BadRequestException(
        `Insufficient balance. Available: ₦${wallet.availableBalance}`,
      );
    }

    // Minimum withdrawal: ₦100
    if (dto.amount < 100) {
      throw new BadRequestException('Minimum withdrawal is ₦100');
    }

    const bankAccount = await this.bankAccountRepository.findOne({
      where: { id: dto.bankAccountId, userId, isActive: true },
    });
    if (!bankAccount) throw new NotFoundException('Bank account not found');

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // Create a pending transaction record first
      const txRef = `WD-${uuidv4().replace(/-/g, '').substring(0, 20).toUpperCase()}`;

      const tx = await qr.manager.save(Transaction, {
        walletId: wallet.id,
        amount: dto.amount,
        currency: 'NGN',
        type: TransactionType.WALLET_WITHDRAWAL,
        direction: TransactionDirection.DEBIT,
        status: TransactionStatus.PENDING,
        reference: txRef,
        idempotencyKey: txRef,
        description: `Withdrawal to ${bankAccount.bankName} ****${bankAccount.accountNumber.slice(-4)}`,
        metadata: { bankAccountId: bankAccount.id },
      });

      // Lock funds immediately (debit available balance)
      await this.debitWallet({
        walletId: wallet.id,
        amount: dto.amount,
        transactionId: tx.id,
        targetAccountType: LedgerAccountType.WITHDRAWAL_TRANSIT,
        description: `Withdrawal to ${bankAccount.bankName}`,
        qr,
      });

      // Create withdrawal request
      const withdrawal = await qr.manager.save(WithdrawalRequest, {
        walletId: wallet.id,
        amount: dto.amount,
        currency: 'NGN',
        recipientCode: bankAccount.recipientCode,
        bankDetails: {
          bankName: bankAccount.bankName,
          bankCode: bankAccount.bankCode,
          accountNumber: bankAccount.accountNumber,
          accountName: bankAccount.accountName,
        },
        status: WithdrawalStatus.APPROVED,
        transactionId: tx.id,
      });

      await qr.commitTransaction();

      // Initiate Paystack transfer AFTER DB commit (side effect)
      // If this fails, the withdrawal remains in APPROVED state for retry
      this.processWithdrawalTransfer(withdrawal.id, tx.id, txRef).catch(
        (err) => {
          this.logger.error(
            `Failed to initiate Paystack transfer for withdrawal ${withdrawal.id}`,
            err,
          );
        },
      );

      return withdrawal;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  /**
   * Sends withdrawal to Paystack Transfer API.
   * Called after the DB transaction commits to avoid leaving the transfer
   * in-flight if the DB commit fails.
   */
  private async processWithdrawalTransfer(
    withdrawalId: string,
    transactionId: string,
    reference: string,
  ): Promise<void> {
    const withdrawal = await this.withdrawalRequestRepository.findOne({
      where: { id: withdrawalId },
    });
    if (!withdrawal) return;

    try {
      await this.withdrawalRequestRepository.update(withdrawalId, {
        status: WithdrawalStatus.PROCESSING,
      });
      await this.transactionRepository.update(transactionId, {
        status: TransactionStatus.PROCESSING,
      });

      const transfer = await this.paymentService.initiateTransfer({
        amount: Math.round(withdrawal.amount * 100),
        recipientCode: withdrawal.recipientCode,
        reference,
        reason: 'GreyFundr wallet withdrawal',
      });

      await this.withdrawalRequestRepository.update(withdrawalId, {
        paymentTransferCode: transfer.transfer_code,
      });

      this.logger.log(
        `Paystack transfer initiated: ${transfer.transfer_code} for withdrawal ${withdrawalId}`,
      );
    } catch (err) {
      this.logger.error(
        `Paystack transfer failed for withdrawal ${withdrawalId}`,
        err,
      );
      // Leave in PROCESSING so a reconciliation job can retry
      // Webhook handler will update status on final result
    }
  }

  // ─── Admin / Internal Operations ─────────────────────────────────────────────

  async freezeWallet(walletId: string, reason: string): Promise<void> {
    await this.walletRepository.update(walletId, {
      status: WalletStatus.FROZEN,
      freezeReason: reason,
    });
    this.logger.warn(`Wallet ${walletId} frozen. Reason: ${reason}`);
  }

  async unfreezeWallet(walletId: string): Promise<void> {
    await this.walletRepository.update(walletId, {
      status: WalletStatus.ACTIVE,
      freezeReason: null,
    });
  }

  async setTransactionPin(
    userId: string,
    dto: SetTransactionPinDto,
  ): Promise<void> {
    const wallet = await this.walletRepository.findOne({ where: { userId } });
    if (!wallet) throw new NotFoundException('Wallet not found');

    if (wallet.transactionPin) {
      throw new BadRequestException(
        'Transaction PIN already set. Use change PIN to update it.',
      );
    }

    if (dto.pin !== dto.confirmPin) {
      throw new BadRequestException('PINs do not match');
    }

    if (this.TRIVIAL_PINS.has(dto.pin)) {
      throw new BadRequestException(
        'PIN is too simple. Please choose a less predictable PIN.',
      );
    }

    const hashed = await bcrypt.hash(dto.pin, 12);

    await this.walletRepository.update(wallet.id, {
      transactionPin: hashed,
      transactionPinSetAt: new Date(),
      transactionPinFailedAttempts: 0,
      transactionPinLockedUntil: null,
    });

    this.logger.log(`[TransactionPin] PIN set for user ${userId}`);
  }

  async changeTransactionPin(
    userId: string,
    dto: ChangeTransactionPinDto,
  ): Promise<void> {
    const wallet = await this.walletRepository.findOne({ where: { userId } });
    if (!wallet) throw new NotFoundException('Wallet not found');

    if (!wallet.transactionPin) {
      throw new BadRequestException(
        'No transaction PIN set. Please set a PIN first.',
      );
    }

    await this.assertPinNotLocked(wallet);

    const isCurrentValid = await bcrypt.compare(
      dto.currentPin,
      wallet.transactionPin,
    );
    if (!isCurrentValid) {
      await this.incrementPinFailedAttempts(wallet);
      throw new BadRequestException('Current PIN is incorrect');
    }

    if (dto.newPin !== dto.confirmPin) {
      throw new BadRequestException('New PINs do not match');
    }

    if (this.TRIVIAL_PINS.has(dto.newPin)) {
      throw new BadRequestException('PIN is too simple.');
    }

    const isSame = await bcrypt.compare(dto.newPin, wallet.transactionPin);
    if (isSame) {
      throw new BadRequestException(
        'New PIN cannot be the same as your current PIN',
      );
    }

    const hashed = await bcrypt.hash(dto.newPin, 12);

    await this.walletRepository.update(wallet.id, {
      transactionPin: hashed,
      transactionPinSetAt: new Date(),
      transactionPinFailedAttempts: 0,
      transactionPinLockedUntil: null,
    });

    this.logger.log(`[TransactionPin] PIN changed for user ${userId}`);
  }

  async verifyTransactionPin(userId: string, pin: string): Promise<void> {
    const wallet = await this.walletRepository.findOne({ where: { userId } });
    if (!wallet) throw new NotFoundException('Wallet not found');

    if (!wallet.transactionPin) {
      throw new BadRequestException(
        'No transaction PIN set. Please set one before making payments.',
      );
    }

    await this.assertPinNotLocked(wallet);

    const isValid = await bcrypt.compare(pin, wallet.transactionPin);

    if (!isValid) {
      await this.incrementPinFailedAttempts(wallet);

      const attempts = (wallet.transactionPinFailedAttempts || 0) + 1;
      const remaining = this.MAX_PIN_ATTEMPTS - attempts;

      throw new BadRequestException(
        remaining > 0
          ? `Incorrect PIN. ${remaining} attempt(s) remaining.`
          : `Incorrect PIN. Your PIN is locked for ${this.PIN_LOCK_MINUTES} minutes.`,
      );
    }

    if ((wallet.transactionPinFailedAttempts || 0) > 0) {
      await this.walletRepository.update(wallet.id, {
        transactionPinFailedAttempts: 0,
        transactionPinLockedUntil: null,
      });
    }
  }

  async getTransactionPinStatus(userId: string): Promise<{
    isSet: boolean;
    isLocked: boolean;
    lockedUntil: Date | null;
    setAt: Date | null;
  }> {
    const wallet = await this.walletRepository.findOne({ where: { userId } });
    if (!wallet) throw new NotFoundException('Wallet not found');

    const isLocked =
      !!wallet.transactionPinLockedUntil &&
      wallet.transactionPinLockedUntil > new Date();

    return {
      isSet: !!wallet.transactionPin,
      isLocked,
      lockedUntil: isLocked ? wallet.transactionPinLockedUntil : null,
      setAt: wallet.transactionPinSetAt,
    };
  }

  private async assertPinNotLocked(wallet: Wallet): Promise<void> {
    if (
      wallet.transactionPinLockedUntil &&
      wallet.transactionPinLockedUntil > new Date()
    ) {
      const minutesLeft = Math.ceil(
        (wallet.transactionPinLockedUntil.getTime() - Date.now()) / 60000,
      );
      throw new BadRequestException(
        `Transaction PIN is locked. Try again in ${minutesLeft} minute(s).`,
      );
    }
  }

  private async incrementPinFailedAttempts(wallet: Wallet): Promise<void> {
    const newCount = (wallet.transactionPinFailedAttempts || 0) + 1;
    const shouldLock = newCount >= this.MAX_PIN_ATTEMPTS;
    const lockedUntil = shouldLock
      ? new Date(Date.now() + this.PIN_LOCK_MINUTES * 60_000)
      : null;

    await this.walletRepository.update(wallet.id, {
      transactionPinFailedAttempts: newCount,
      ...(lockedUntil && { transactionPinLockedUntil: lockedUntil }),
    });

    if (shouldLock) {
      this.logger.warn(
        `[TransactionPin] PIN locked for wallet ${wallet.id} until ${lockedUntil?.toISOString()}`,
      );
    }
  }
}
