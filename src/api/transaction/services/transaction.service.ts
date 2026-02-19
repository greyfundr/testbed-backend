import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Transaction, LedgerEntry } from '../entities';
import {
  TransactionType,
  TransactionStatus,
  TransactionDirection,
  LedgerAccountType,
} from '../enums/transaction.enum';
import { WalletService } from '../../wallet/services';
import {
  DonateToCampaignDto,
  PaySplitBillDto,
  PayInvoiceDto,
  TransactionQueryDto,
  InternalTransferDto,
} from '../dto';
import { PaginatedResult } from '../../../common/interfaces';
import { LedgerEntryRepository, TransactionRepository } from '../repository';

const PLATFORM_FEE_RATE = 0.015;
const PLATFORM_FEE_CAP_KOBO = 500_000;

function calculateFee(amount: number): number {
  const fee = Math.floor(amount * PLATFORM_FEE_RATE);
  return Math.min(fee, PLATFORM_FEE_CAP_KOBO);
}

function generateRef(prefix: string): string {
  return `${prefix}-${uuidv4().replace(/-/g, '').substring(0, 20).toUpperCase()}`;
}

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepo: TransactionRepository,
    private readonly ledgerRepo: LedgerEntryRepository,
    @Inject(forwardRef(() => WalletService))
    private readonly walletService: WalletService,
    private readonly dataSource: DataSource,
  ) {}

  // ─── Campaign Donation ────────────────────────────────────────────────────────

  /**
   * Donates from a user's wallet to a campaign's escrow.
   * Funds are locked until the campaign succeeds (settles) or fails (refunds).
   *
   * Flow:
   *   User wallet available  →  Campaign escrow  (funds locked, not spendable)
   *   On success:  Campaign escrow → Campaign owner wallet (minus platform fee)
   *   On failure:  Campaign escrow → Each backer's wallet
   */
  async donateToCampaign(
    userId: string,
    dto: DonateToCampaignDto,
  ): Promise<Transaction> {
    const wallet = await this.walletService.getWalletByUserId(userId);

    if (dto.amount < 100) {
      // Minimum ₦1 = 100 kobo
      throw new BadRequestException('Minimum donation is ₦1');
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const ref = generateRef('DON');

      const tx = await qr.manager.save(Transaction, {
        walletId: wallet.id,
        amount: dto.amount,
        currency: 'NGN',
        type: TransactionType.CAMPAIGN_DONATION,
        direction: TransactionDirection.DEBIT,
        status: TransactionStatus.COMPLETED,
        reference: ref,
        description: dto.note ?? `Donation to campaign`,
        sourceRef: { entity: 'campaign', id: dto.campaignId },
        feeAmount: 0, // fee taken at settlement, not at donation
        metadata: {
          campaignId: dto.campaignId,
          note: dto.note,
          anonymous: dto.anonymous ?? false,
        },
      });

      await this.walletService.lockIntoEscrow({
        walletId: wallet.id,
        amount: dto.amount,
        transactionId: tx.id,
        entityType: 'campaign',
        entityId: dto.campaignId,
        description: `Donation to campaign ${dto.campaignId}`,
        qr,
      });

      await qr.commitTransaction();

      this.logger.log(
        `Campaign donation ${ref}: ${dto.amount} kobo from wallet ${wallet.id} to campaign ${dto.campaignId}`,
      );

      return tx;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  /**
   * Settles a funded campaign — releases escrow to campaign owner's wallet.
   * Called by the campaign service when campaign reaches its target.
   * Must be called inside an existing transaction or starts its own.
   */
  async settleCampaign(params: {
    campaignId: string;
    ownerUserId: string;
    totalEscrowedKobo: number;
    backerWalletIds: string[]; // wallets that contributed to this campaign
  }): Promise<Transaction> {
    const { campaignId, ownerUserId, totalEscrowedKobo } = params;
    const ownerWallet = await this.walletService.getWalletByUserId(ownerUserId);
    const feeAmount = calculateFee(totalEscrowedKobo);
    const netAmount = totalEscrowedKobo - feeAmount;

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const ref = generateRef('SET');

      const tx = await qr.manager.save(Transaction, {
        walletId: ownerWallet.id,
        amount: netAmount,
        currency: 'NGN',
        type: TransactionType.CAMPAIGN_SETTLEMENT,
        direction: TransactionDirection.CREDIT,
        status: TransactionStatus.COMPLETED,
        reference: ref,
        description: `Campaign settlement for ${campaignId}`,
        sourceRef: { entity: 'campaign', id: campaignId },
        feeAmount,
        confirmedAt: new Date(),
        metadata: { campaignId, grossAmount: totalEscrowedKobo, feeAmount },
      });

      await this.walletService.releaseEscrowToWallet({
        escrowHolderWalletId: ownerWallet.id, // escrow was tracked on each backer's wallet
        recipientWalletId: ownerWallet.id,
        grossAmount: totalEscrowedKobo,
        feeAmount,
        transactionId: tx.id,
        entityType: 'campaign',
        entityId: campaignId,
        description: `Campaign ${campaignId} settlement`,
        qr,
      });

      await qr.commitTransaction();
      return tx;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  /**
   * Refunds all backers of a failed/expired campaign.
   * Processes each backer in a single transaction for atomicity.
   */
  async refundCampaignBackers(params: {
    campaignId: string;
    backers: Array<{ userId: string; amountKobo: number }>;
  }): Promise<void> {
    const { campaignId, backers } = params;

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      for (const backer of backers) {
        const wallet = await this.walletService.getWalletByUserId(
          backer.userId,
        );
        const ref = generateRef('RFD');

        const tx = await qr.manager.save(Transaction, {
          walletId: wallet.id,
          amount: backer.amountKobo,
          currency: 'NGN',
          type: TransactionType.CAMPAIGN_REFUND,
          direction: TransactionDirection.CREDIT,
          status: TransactionStatus.COMPLETED,
          reference: ref,
          description: `Refund for campaign ${campaignId}`,
          sourceRef: { entity: 'campaign', id: campaignId },
          feeAmount: 0,
          confirmedAt: new Date(),
        });

        await this.walletService.refundEscrowToWallet({
          backerWalletId: wallet.id,
          amount: backer.amountKobo,
          transactionId: tx.id,
          entityType: 'campaign',
          entityId: campaignId,
          description: `Campaign ${campaignId} refund`,
          qr,
        });
      }

      await qr.commitTransaction();
      this.logger.log(
        `Refunded ${backers.length} backers for campaign ${campaignId}`,
      );
    } catch (err) {
      await qr.rollbackTransaction();
      this.logger.error(
        `Failed to refund backers for campaign ${campaignId}`,
        err,
      );
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ─── Split Bill Payment ───────────────────────────────────────────────────────

  /**
   * Pays a user's share of a split bill from their wallet.
   * Funds go into bill escrow until the bill is fully paid, then settle.
   */
  async paySplitBill(
    userId: string,
    dto: PaySplitBillDto,
  ): Promise<Transaction> {
    const wallet = await this.walletService.getWalletByUserId(userId);

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const ref = generateRef('BILL');

      const tx = await qr.manager.save(Transaction, {
        walletId: wallet.id,
        amount: dto.amount,
        currency: 'NGN',
        type: TransactionType.SPLIT_BILL_PAYMENT,
        direction: TransactionDirection.DEBIT,
        status: TransactionStatus.COMPLETED,
        reference: ref,
        description: dto.note ?? `Split bill payment`,
        sourceRef: { entity: 'split_bill', id: dto.billId },
        feeAmount: 0,
        confirmedAt: new Date(),
        metadata: { billId: dto.billId, billShareId: dto.billShareId },
      });

      await this.walletService.lockIntoEscrow({
        walletId: wallet.id,
        amount: dto.amount,
        transactionId: tx.id,
        entityType: 'split_bill',
        entityId: dto.billId,
        description: `Payment for split bill ${dto.billId}`,
        qr,
      });

      await qr.commitTransaction();

      this.logger.log(
        `Split bill payment ${ref}: ${dto.amount} kobo from wallet ${wallet.id} to bill ${dto.billId}`,
      );

      return tx;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  /**
   * Settles a fully-funded split bill to the bill creator or vendor.
   */
  async settleSplitBill(params: {
    billId: string;
    recipientUserId: string;
    totalEscrowedKobo: number;
  }): Promise<Transaction> {
    const { billId, recipientUserId, totalEscrowedKobo } = params;
    const recipientWallet =
      await this.walletService.getWalletByUserId(recipientUserId);
    const feeAmount = calculateFee(totalEscrowedKobo);

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const ref = generateRef('BSET');

      const tx = await qr.manager.save(Transaction, {
        walletId: recipientWallet.id,
        amount: totalEscrowedKobo - feeAmount,
        currency: 'NGN',
        type: TransactionType.BILL_SETTLEMENT,
        direction: TransactionDirection.CREDIT,
        status: TransactionStatus.COMPLETED,
        reference: ref,
        description: `Bill settlement for ${billId}`,
        sourceRef: { entity: 'split_bill', id: billId },
        feeAmount,
        confirmedAt: new Date(),
      });

      await this.walletService.releaseEscrowToWallet({
        escrowHolderWalletId: recipientWallet.id,
        recipientWalletId: recipientWallet.id,
        grossAmount: totalEscrowedKobo,
        feeAmount,
        transactionId: tx.id,
        entityType: 'split_bill',
        entityId: billId,
        description: `Bill ${billId} settlement`,
        qr,
      });

      await qr.commitTransaction();
      return tx;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ─── Invoice Payment ─────────────────────────────────────────────────────────

  /**
   * Pays an invoice directly from wallet to the invoice issuer.
   * No escrow — direct wallet-to-wallet transfer.
   */
  async payInvoice(
    payerUserId: string,
    dto: PayInvoiceDto,
  ): Promise<Transaction> {
    const payerWallet = await this.walletService.getWalletByUserId(payerUserId);
    const recipientWallet = await this.walletService.getWalletByUserId(
      dto.recipientUserId,
    );

    if (payerWallet.id === recipientWallet.id) {
      throw new BadRequestException('Cannot pay an invoice to yourself');
    }

    const feeAmount = calculateFee(dto.amount);
    const netAmount = dto.amount - feeAmount;

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const ref = generateRef('INV');

      // Debit transaction on payer side
      const debitTx = await qr.manager.save(Transaction, {
        walletId: payerWallet.id,
        amount: dto.amount,
        currency: 'NGN',
        type: TransactionType.INVOICE_PAYMENT,
        direction: TransactionDirection.DEBIT,
        status: TransactionStatus.COMPLETED,
        reference: ref,
        description: `Invoice payment: ${dto.invoiceId}`,
        sourceRef: { entity: 'invoice', id: dto.invoiceId },
        counterpartyWalletId: recipientWallet.id,
        feeAmount,
        confirmedAt: new Date(),
      });

      // Credit transaction on recipient side
      const creditRef = generateRef('INVR');
      await qr.manager.save(Transaction, {
        walletId: recipientWallet.id,
        amount: netAmount,
        currency: 'NGN',
        type: TransactionType.INVOICE_PAYMENT,
        direction: TransactionDirection.CREDIT,
        status: TransactionStatus.COMPLETED,
        reference: creditRef,
        description: `Invoice received: ${dto.invoiceId}`,
        sourceRef: { entity: 'invoice', id: dto.invoiceId },
        counterpartyWalletId: payerWallet.id,
        feeAmount: 0,
        confirmedAt: new Date(),
      });

      // Debit payer
      await this.walletService.debitWallet({
        walletId: payerWallet.id,
        amount: dto.amount,
        transactionId: debitTx.id,
        targetAccountType: LedgerAccountType.USER_WALLET,
        targetEntityId: recipientWallet.id,
        description: `Invoice payment to ${dto.recipientUserId}`,
        qr,
      });

      // Credit recipient (net of fee)
      await this.walletService.creditWallet({
        walletId: recipientWallet.id,
        amount: netAmount,
        transactionId: debitTx.id,
        sourceAccountType: LedgerAccountType.USER_WALLET,
        sourceEntityId: payerWallet.id,
        description: `Invoice payment from ${payerUserId}`,
        qr,
      });

      // Platform fee ledger entry
      if (feeAmount > 0) {
        await qr.manager.save(LedgerEntry, {
          transactionId: debitTx.id,
          walletId: null,
          accountType: LedgerAccountType.PLATFORM_REVENUE,
          accountEntityId: dto.invoiceId,
          direction: TransactionDirection.CREDIT,
          amount: feeAmount,
          currency: 'NGN',
          runningBalance: null,
          description: `Platform fee for invoice ${dto.invoiceId}`,
        });
      }

      await qr.commitTransaction();

      this.logger.log(
        `Invoice payment ${ref}: ${dto.amount} kobo from ${payerUserId} to ${dto.recipientUserId}`,
      );

      return debitTx;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ─── Transferred Bill Payment ─────────────────────────────────────────────────

  /**
   * Pays a bill that was transferred to the current user.
   * Semantically identical to invoice payment; use appropriate type label.
   */
  async payTransferredBill(
    payerUserId: string,
    params: {
      billId: string;
      recipientUserId: string;
      amount: number;
    },
  ): Promise<Transaction> {
    return this.payInvoice(payerUserId, {
      invoiceId: params.billId,
      recipientUserId: params.recipientUserId,
      amount: params.amount,
    });
  }

  // ─── Internal Transfer (Wallet to Wallet) ────────────────────────────────────

  /**
   * Transfers funds between two GreyFundr user wallets.
   */
  async internalTransfer(
    senderUserId: string,
    dto: InternalTransferDto,
  ): Promise<Transaction> {
    const senderWallet =
      await this.walletService.getWalletByUserId(senderUserId);
    const recipientWallet = await this.walletService.getWalletByUserId(
      dto.recipientUserId,
    );

    if (senderWallet.id === recipientWallet.id) {
      throw new BadRequestException('Cannot transfer to your own wallet');
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const outRef = generateRef('OUT');
      const inRef = generateRef('IN');

      const outTx = await qr.manager.save(Transaction, {
        walletId: senderWallet.id,
        amount: dto.amount,
        currency: 'NGN',
        type: TransactionType.TRANSFER_OUT,
        direction: TransactionDirection.DEBIT,
        status: TransactionStatus.COMPLETED,
        reference: outRef,
        description: dto.note ?? `Transfer to ${dto.recipientUserId}`,
        counterpartyWalletId: recipientWallet.id,
        feeAmount: 0,
        confirmedAt: new Date(),
      });

      await qr.manager.save(Transaction, {
        walletId: recipientWallet.id,
        amount: dto.amount,
        currency: 'NGN',
        type: TransactionType.TRANSFER_IN,
        direction: TransactionDirection.CREDIT,
        status: TransactionStatus.COMPLETED,
        reference: inRef,
        description: dto.note ?? `Transfer from ${senderUserId}`,
        counterpartyWalletId: senderWallet.id,
        feeAmount: 0,
        confirmedAt: new Date(),
      });

      await this.walletService.debitWallet({
        walletId: senderWallet.id,
        amount: dto.amount,
        transactionId: outTx.id,
        targetAccountType: LedgerAccountType.USER_WALLET,
        targetEntityId: recipientWallet.id,
        description: `Transfer to user ${dto.recipientUserId}`,
        qr,
      });

      await this.walletService.creditWallet({
        walletId: recipientWallet.id,
        amount: dto.amount,
        transactionId: outTx.id,
        sourceAccountType: LedgerAccountType.USER_WALLET,
        sourceEntityId: senderWallet.id,
        description: `Transfer from user ${senderUserId}`,
        qr,
      });

      await qr.commitTransaction();
      return outTx;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ─── Transaction History & Reads ─────────────────────────────────────────────

  async getTransactionHistory(
    userId: string,
    query: TransactionQueryDto,
  ): Promise<PaginatedResult<Transaction>> {
    const wallet = await this.walletService.getWalletByUserId(userId);

    const {
      page = 1,
      limit = 20,
      type,
      direction,
      status,
      startDate,
      endDate,
      search,
    } = query;

    const qb = this.transactionRepo
      .createQueryBuilder('tx')
      .where('tx.wallet_id = :walletId', { walletId: wallet.id })
      .orderBy('tx.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (type) qb.andWhere('tx.type = :type', { type });
    if (direction) qb.andWhere('tx.direction = :direction', { direction });
    if (status) qb.andWhere('tx.status = :status', { status });

    if (startDate) {
      qb.andWhere('tx.created_at >= :startDate', {
        startDate: new Date(startDate),
      });
    }
    if (endDate) {
      qb.andWhere('tx.created_at <= :endDate', { endDate: new Date(endDate) });
    }
    if (search) {
      qb.andWhere(
        '(tx.reference ILIKE :search OR tx.description ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPreviousPage: page > 1,
      },
    };
  }

  async getTransactionById(
    userId: string,
    transactionId: string,
  ): Promise<Transaction> {
    const wallet = await this.walletService.getWalletByUserId(userId);

    const tx = await this.transactionRepo.findOne({
      where: { id: transactionId, walletId: wallet.id },
      relations: ['ledgerEntries'],
    });

    if (!tx) throw new NotFoundException('Transaction not found');
    return tx;
  }

  async getTransactionLedger(
    userId: string,
    transactionId: string,
  ): Promise<LedgerEntry[]> {
    const wallet = await this.walletService.getWalletByUserId(userId);

    // Verify ownership
    const tx = await this.transactionRepo.findOne({
      where: { id: transactionId, walletId: wallet.id },
    });
    if (!tx) throw new NotFoundException('Transaction not found');

    return this.ledgerRepo.findAll({
      where: { transactionId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Returns aggregate statistics for a user's wallet activity.
   */
  async getTransactionSummary(userId: string): Promise<{
    totalIn: number;
    totalOut: number;
    totalDonations: number;
    totalBillPayments: number;
    transactionCount: number;
    periodStart: Date;
    periodEnd: Date;
  }> {
    const wallet = await this.walletService.getWalletByUserId(userId);
    const periodStart = new Date();
    periodStart.setDate(1); // start of current month
    const periodEnd = new Date();

    const result = await this.transactionRepo
      .createQueryBuilder('tx')
      .select([
        `SUM(CASE WHEN tx.direction = 'credit' AND tx.status = 'completed' THEN tx.amount ELSE 0 END)`,
        '"totalIn"',
        `SUM(CASE WHEN tx.direction = 'debit' AND tx.status = 'completed' THEN tx.amount ELSE 0 END)`,
        '"totalOut"',
        `SUM(CASE WHEN tx.type = 'campaign_donation' AND tx.status = 'completed' THEN tx.amount ELSE 0 END)`,
        '"totalDonations"',
        `SUM(CASE WHEN tx.type = 'split_bill_payment' AND tx.status = 'completed' THEN tx.amount ELSE 0 END)`,
        '"totalBillPayments"',
        `COUNT(*)`,
        '"transactionCount"',
      ])
      .where('tx.wallet_id = :walletId', { walletId: wallet.id })
      .andWhere('tx.created_at BETWEEN :start AND :end', {
        start: periodStart,
        end: periodEnd,
      })
      .getRawOne();

    return {
      totalIn: Number(result?.totalIn ?? 0),
      totalOut: Number(result?.totalOut ?? 0),
      totalDonations: Number(result?.totalDonations ?? 0),
      totalBillPayments: Number(result?.totalBillPayments ?? 0),
      transactionCount: Number(result?.transactionCount ?? 0),
      periodStart,
      periodEnd,
    };
  }

  // ─── Internal helpers used by webhook service ─────────────────────────────────

  /**
   * Looks up a transaction by Paystack reference.
   * Used by webhook handler to find in-flight transactions.
   */
  async findByPaystackReference(
    gatewayReference: string,
  ): Promise<Transaction | null> {
    return this.transactionRepo.findOne({ where: { gatewayReference } });
  }

  async findByReference(reference: string): Promise<Transaction | null> {
    return this.transactionRepo.findOne({ where: { reference } });
  }

  async updateTransactionStatus(
    transactionId: string,
    status: TransactionStatus,
    extras: Partial<Transaction> = {},
  ): Promise<void> {
    await this.transactionRepo.update(transactionId, { status, ...extras });
  }
}
