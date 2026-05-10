import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, In, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { WebhookLog, Transaction } from '../../transaction/entities';
import { User } from '../../user/entities';
import {
  VirtualAccount,
  WithdrawalRequest,
  WithdrawalStatus,
} from '../../wallet/entities/';
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
} from '../../transaction/repository';
import {
  VirtualAccountRepository,
  WalletRepository,
  WithdrawalRequestRepository,
} from '../../wallet/repository';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SplitBillParticipant, SplitBill } from '../../split-bill/entities';
import { ParticipantStatus, SplitBillStatus } from '../../split-bill/enums';
import { EventService } from '../../event/services/event.service';
import {
  EventContributionType,
  EventPaymentMethod,
} from '../../event/enums/event.enum';
import { Event, EventContribution } from 'src/api/event/entities';
import { UserRepository } from 'src/api/user/repository';
import { Campaign, Donation } from 'src/api/campaign/entities';
import { DonationOnBehalfOf } from 'src/api/campaign/enums/campaign.enum';

@Injectable()
export class PaymentWebhookService {
  private readonly logger = new Logger(PaymentWebhookService.name);

  constructor(
    private readonly webhookLogRepo: WebhookLogRepository,
    private readonly transactionRepo: TransactionRepository,
    private readonly withdrawalRepo: WithdrawalRequestRepository,
    private readonly virtualAccountRepo: VirtualAccountRepository,
    private readonly walletRepository: WalletRepository,
    private readonly userRepository: UserRepository,

    @Inject(forwardRef(() => WalletService))
    private readonly walletService: WalletService,
    @Inject(forwardRef(() => EventService))
    private readonly eventService: EventService,
    private readonly paymentService: PaymentService,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async dispatch(event: string, data: Record<string, any>): Promise<void> {
    const reference = this.extractReference(event, data);
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

  private async handleChargeSuccess(
    data: PaystackChargeSuccessData,
  ): Promise<void> {
    const { reference } = data;

    await this.paymentService.verifyTransaction(reference);

    const paymentType = data.metadata?.type || data.metadata?.purpose;

    switch (paymentType) {
      case 'CAMPAIGN_DONATION':
        this.logger.log(`Routing webhook to campaign donation: ${reference}`);
        await this.processCampaignDonationWebhook(data);
        break;

      case 'GUEST_BILL_PAYMENT':
        this.logger.log(`Routing webhook to guest bill payment: ${reference}`);
        await this.processGuestBillPaymentWebhook(data);
        break;

      case 'USER_BILL_PAYMENT':
        this.logger.log(`Routing webhook to bill payment: ${reference}`);
        await this.processBillPaymentWebhook(data);
        break;

      case 'EVENT_CONTRIBUTION':
        this.logger.log(`Routing webhook to event contribution: ${reference}`);
        await this.processEventContributionWebhook(data);
        break;

      case 'wallet_funding':
      default:
        this.logger.log(`Routing webhook to wallet funding: ${reference}`);
        await this.processWalletFundingWebhook(data);
        break;
    }
  }

  private triggerDonationEvents(
    campaign: Campaign,
    donation: Donation,
    user: User,
    amount: number,
    isAnonymous: boolean,
    customUsername: string,
  ) {
    this.eventEmitter.emit('donation.receipt', {
      donorId: user.id,
      email: user.email,
      campaignName: campaign.title,
      amount,
    });

    this.eventEmitter.emit('donation.received', {
      creatorId: campaign.creatorId,
      campaignName: campaign.title,
      amount,
      donorName: isAnonymous ? 'Anonymous' : customUsername || user.firstName,
    });

    const newCurrentAmount = Number(campaign.currentAmount) + amount;
    const targetAmount = Number(campaign.target);

    if (targetAmount > 0) {
      const previousAmount = Number(campaign.currentAmount);
      const hit50 =
        previousAmount < targetAmount / 2 &&
        newCurrentAmount >= targetAmount / 2;
      const hit100 =
        previousAmount < targetAmount && newCurrentAmount >= targetAmount;

      if (hit50 || hit100) {
        this.eventEmitter.emit('campaign.milestone', {
          creatorId: campaign.creatorId,
          campaignName: campaign.title,
          percentage: hit100 ? 100 : 50,
        });
      }
    }
  }

  private async processCampaignDonationWebhook(
    data: PaystackChargeSuccessData,
  ): Promise<void> {
    const { reference, metadata, amount: amountInKobo } = data;
    const {
      campaignId,
      user_id: userId,
      isAnonymous,
      customUsername,
      onBehalfOf,
      onBehalfOfUserId,
      onBehalfOfExternal,
      comment,
    } = metadata;

    const amount = amountInKobo / 100;

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const transaction = await qr.manager.findOne(Transaction, {
        where: { reference, status: TransactionStatus.PENDING },
      });

      if (!transaction) {
        this.logger.warn(
          `Transaction not found or already processed: ${reference}`,
        );
        await qr.rollbackTransaction();
        return;
      }

      const campaign = await qr.manager.findOne(Campaign, {
        where: { id: campaignId },
      });
      const user = await qr.manager.findOne(User, { where: { id: userId } });

      if (!campaign || !user) {
        throw new Error('Campaign or User not found during webhook processing');
      }

      transaction.status = TransactionStatus.COMPLETED;
      await qr.manager.save(transaction);

      const donation = qr.manager.create(Donation, {
        amount,
        donorId: onBehalfOfUserId ? onBehalfOfUserId : user.id,
        campaignId: campaign.id,
        transactionId: transaction.id,
        isAnonymous: isAnonymous ?? false,
        customUsername: customUsername,
        onBehalfOf: onBehalfOf ?? DonationOnBehalfOf.SELF,
        onBehalfOfUserId: onBehalfOfUserId,
        onBehalfOfFullName: onBehalfOfExternal?.fullName,
        onBehalfOfPhone: onBehalfOfExternal?.phoneNumber,
        comment: comment || 'Donation via Paystack',
      });

      const savedDonation = await qr.manager.save(donation);

      await qr.manager.update(Campaign, campaign.id, {
        currentAmount: () => `current_amount + ${amount}`,
      });

      const updatedCampaign = await qr.manager.findOne(Campaign, {
        where: { id: campaign.id },
        relations: ['creator'],
      });

      await qr.commitTransaction();

      this.triggerDonationEvents(
        updatedCampaign as Campaign,
        savedDonation,
        user,
        amount,
        isAnonymous as boolean,
        customUsername as string,
      );

      this.logger.log(`Successfully finalized Paystack donation: ${reference}`);
    } catch (err) {
      await qr.rollbackTransaction();
      this.logger.error(
        `Webhook processing failed for reference: ${reference}`,
        err,
      );
      throw err;
    } finally {
      await qr.release();
    }
  }

  private async processBillPaymentWebhook(
    data: PaystackChargeSuccessData,
  ): Promise<void> {
    const { reference, amount: amountKobo, metadata, channel } = data;
    const billId = metadata.split_bill_id;

    const targetParticipantIds: string[] =
      metadata.target_participant_ids || [];

    if (!billId || targetParticipantIds.length === 0) {
      this.logger.error(
        `Missing metadata for bill payment webhook: ${reference}`,
      );
      return;
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const existingTx = await qr.manager.findOne(Transaction, {
        where: { gatewayReference: reference },
        lock: { mode: 'pessimistic_write' },
      });

      if (existingTx && existingTx.status === TransactionStatus.COMPLETED) {
        this.logger.warn(
          `Webhook ignored: Payment ${reference} already processed.`,
        );
        await qr.rollbackTransaction();
        return;
      }

      const bill = await qr.manager.findOne(SplitBill, {
        where: { id: billId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!bill) throw new Error('Bill not found for webhook');

      const paidAmount = amountKobo / 100;

      if (existingTx) {
        await qr.manager.update(Transaction, existingTx.id, {
          status: TransactionStatus.COMPLETED,
          confirmedAt: new Date(data.paid_at),
          gatewayResponse: data as Record<string, any>,
          amount: paidAmount,
        });
      } else {
        await qr.manager.save(Transaction, {
          amount: paidAmount,
          currency: bill.currency,
          type: TransactionType.SPLIT_BILL_PAYMENT,
          direction: TransactionDirection.CREDIT,
          status: TransactionStatus.COMPLETED,
          gatewayReference: reference,
          reference: `${reference}-${uuidv4()}`,
          paymentGateway: 'paystack',
          description: `Split bill payment via Paystack — ${bill.title}`,
          confirmedAt: new Date(data.paid_at),
          metadata: { ...metadata },
        });
      }

      const participants = await qr.manager.find(SplitBillParticipant, {
        where: { id: In(targetParticipantIds), splitBillId: billId },
        lock: { mode: 'pessimistic_write' },
      });

      const payerParticipantId = metadata.paid_by_participant_id;

      const sortedParticipants = participants.sort((a, b) => {
        if (a.id === payerParticipantId) return -1;
        if (b.id === payerParticipantId) return 1;
        return 0;
      });

      let remainingToDistribute = paidAmount;

      for (const p of sortedParticipants) {
        if (remainingToDistribute <= 0) break;

        const totalOwed = p.amountOwed + p.balanceAdjustment;
        const currentDebt = Math.max(0, totalOwed - p.amountPaid);

        if (currentDebt <= 0) continue;

        const paymentForThisParticipant = Math.min(
          remainingToDistribute,
          currentDebt,
        );
        const newAmountPaid = p.amountPaid + paymentForThisParticipant;
        const isFullyPaid = newAmountPaid >= totalOwed;

        await qr.manager.update(SplitBillParticipant, p.id, {
          amountPaid: newAmountPaid,
          amountRemaining: Math.max(0, totalOwed - newAmountPaid),
          status: isFullyPaid
            ? ParticipantStatus.PAID
            : ParticipantStatus.PARTIAL,
          paymentMethod: channel === 'card' ? 'card' : 'bank_transfer',
          fullyPaidAt: isFullyPaid ? new Date() : null,
          firstPaidAt: p.firstPaidAt ?? new Date(),
        });

        remainingToDistribute -= paymentForThisParticipant;
      }

      const newTotalCollected = bill.totalCollected + paidAmount;
      const billFullyFunded = newTotalCollected >= bill.totalAmount;

      const totalPaidParticipants = await qr.manager.count(
        SplitBillParticipant,
        {
          where: { splitBillId: billId, status: ParticipantStatus.PAID },
        },
      );

      await qr.manager.update(SplitBill, billId, {
        totalCollected: newTotalCollected,
        totalPaidParticipants,
        status: billFullyFunded
          ? SplitBillStatus.FUNDED
          : SplitBillStatus.PARTIALLY_PAID,
      });

      await qr.commitTransaction();

      this.eventEmitter.emit('split_bill.payment_received', {
        creatorId: bill.creatorId,
        participantName: metadata.user_name || 'A participant',
        billTitle: bill.title,
        amount: paidAmount,
        totalCollected: newTotalCollected,
      });
    } catch (err) {
      await qr.rollbackTransaction();
      this.logger.error(`Webhook error: ${err.message}`);
      throw err;
    } finally {
      await qr.release();
    }
  }

  private async processGuestBillPaymentWebhook(
    data: PaystackChargeSuccessData,
  ): Promise<void> {
    const { reference, amount: amountKobo, metadata, channel } = data;
    const billId = metadata.split_bill_id;
    const participantId = metadata.participant_id;

    if (!billId || !participantId) {
      this.logger.error(
        `Missing metadata for guest payment webhook: ${reference}`,
      );
      return;
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const existingTx = await qr.manager.findOne(Transaction, {
        where: { gatewayReference: reference },
      });

      if (existingTx) {
        this.logger.warn(
          `Webhook ignored: Payment ${reference} already processed.`,
        );
        await qr.rollbackTransaction();
        return;
      }

      const participant = await qr.manager.findOne(SplitBillParticipant, {
        where: { id: participantId, splitBillId: billId },
        lock: { mode: 'pessimistic_write' },
      });

      const bill = await qr.manager.findOne(SplitBill, {
        where: { id: billId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!participant || !bill) {
        throw new Error('Participant or Bill not found for webhook processing');
      }

      const tx = await qr.manager.save(Transaction, {
        walletId: null,
        amount: amountKobo / 100,
        currency: bill.currency,
        type: TransactionType.SPLIT_BILL_PAYMENT,
        direction: TransactionDirection.CREDIT,
        status: TransactionStatus.COMPLETED,
        reference: reference,
        gatewayReference: reference,
        paymentGateway: 'paystack',
        description: `Guest payment (Webhook) — ${bill.title}`,
        sourceRef: { entity: 'split_bill', id: billId },
        confirmedAt: new Date(data.paid_at),
        metadata: {
          participantId: participant.id,
          guestName: participant.guestName,
          channel: channel,
        },
      });

      const effectiveOwed =
        participant.amountOwed + participant.balanceAdjustment;
      const newAmountPaid = participant.amountPaid + amountKobo / 100;
      const newAmountRemaining = Math.max(0, effectiveOwed - newAmountPaid);
      const participantFullyPaid = newAmountRemaining === 0;

      await qr.manager.update(SplitBillParticipant, participantId, {
        amountPaid: newAmountPaid,
        amountRemaining: newAmountRemaining,
        status: participantFullyPaid
          ? ParticipantStatus.PAID
          : ParticipantStatus.PARTIAL,
        paymentMethod: channel === 'card' ? 'card' : 'bank_transfer',
        firstPaidAt: participant.firstPaidAt ?? new Date(),
        fullyPaidAt: participantFullyPaid ? new Date() : null,
      });

      const newTotalCollected = bill.totalCollected + amountKobo / 100;
      const billFullyFunded = newTotalCollected >= bill.totalAmount;

      await qr.manager.update(SplitBill, billId, {
        totalCollected: newTotalCollected,
        ...(participantFullyPaid && {
          totalPaidParticipants: () => 'total_paid_participants + 1',
        }),
        status: billFullyFunded
          ? SplitBillStatus.FUNDED
          : SplitBillStatus.PARTIALLY_PAID,
      });

      await qr.commitTransaction();

      this.eventEmitter.emit('split_bill.payment_received', {
        creatorId: bill.creatorId,
        participantName: participant.guestName || 'A guest',
        billTitle: bill.title,
        billId: bill.id,
        amount: amountKobo / 100,
        currency: bill.currency,
        totalCollected: newTotalCollected,
        totalAmount: bill.totalAmount,
      });

      this.logger.log(
        `Guest payment webhook processed successfully for ref: ${reference}`,
      );
      this.logger.log(
        `Guest payment webhook processed successfully for ref: ${reference}`,
      );
    } catch (err) {
      await qr.rollbackTransaction();
      this.logger.error(
        `Failed to process guest payment webhook: ${err.message}`,
        err.stack,
      );
      throw err;
    } finally {
      await qr.release();
    }
  }

  private async processEventContributionWebhook(
    data: PaystackChargeSuccessData,
  ): Promise<void> {
    const { reference, amount: amountKobo, metadata } = data;
    const {
      eventId,
      userId,
      contributeDto,
      displayName,
      comment,
      image,
      onBehalfOf,
      onBehalfOfUserId,
      onBehalfOfFullName,
    } = metadata;

    if (!eventId || !userId || !contributeDto) {
      this.logger.error(
        `Missing metadata for event contribution webhook: ${reference}`,
      );
      return;
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const existingTx = await qr.manager.findOne(Transaction, {
        where: { gatewayReference: reference },
      });

      if (existingTx && existingTx.status === TransactionStatus.COMPLETED) {
        this.logger.warn(
          `Webhook ignored: Event contribution ${reference} already processed.`,
        );
        await qr.rollbackTransaction();
        return;
      }

      const user = await qr.manager.findOne(User, { where: { id: userId } });
      const event = await qr.manager.findOne(Event, { where: { id: eventId } });
      const wallet = await this.walletService.getWalletByUserId(userId);

      if (!user || !event) {
        throw new Error(
          `User or Event not found for event contribution finalize`,
        );
      }

      let transactionType: TransactionType;
      switch (contributeDto.type) {
        case EventContributionType.DONATION:
          transactionType = TransactionType.EVENT_DONATION;
          break;
        case EventContributionType.PURCHASE:
          transactionType = TransactionType.EVENT_PURCHASE;
          break;
        case EventContributionType.GIFTING:
          transactionType = TransactionType.EVENT_GIFTING;
          break;
        default:
          transactionType = TransactionType.EVENT_DONATION;
      }

      const transaction = await qr.manager.save(Transaction, {
        walletId: wallet.id,
        amount: amountKobo / 100,
        currency: 'NGN',
        type: transactionType,
        direction: TransactionDirection.DEBIT,
        status: TransactionStatus.COMPLETED,
        reference: reference, // Paystack ref
        gatewayReference: reference,
        description: `Direct Paystack contribution to event: ${event.title} (${contributeDto.type})`,
        gatewayResponse: data,
        confirmedAt: new Date(data.paid_at),
        metadata: {
          eventId,
          type: contributeDto.type,
          userId: user.id,
          channel: data.channel,
          onBehalfOf: onBehalfOf,
          onBehalfOfUserId: onBehalfOfUserId,
          onBehalfOfFullName: onBehalfOfFullName,
        },
      });

      let contributorName = displayName;

      // 3. Create the Contribution Record directly
      const contribution = qr.manager.create(EventContribution, {
        eventId: event.id,
        userId: onBehalfOfUserId ? onBehalfOfUserId : user.id,
        type: contributeDto.type,
        amount: contributeDto.amount,
        details: contributeDto.details ?? {},
        transactionId: transaction.id,
        displayName: contributorName,
        comment,
        image,
        onBehalfOf,
        onBehalfOfUserId,
        onBehalfOfFullName,
      });

      const savedContribution = await qr.manager.save(contribution);

      await qr.manager.update(Event, event.id, {
        amountRaised: () => `amount_raised + ${amountKobo / 100}`,
      });

      await qr.commitTransaction();
      this.logger.log(
        `Event contribution finalized directly via Paystack webhook for ref: ${reference}`,
      );

      const updatedEvent = await this.dataSource
        .getRepository(Event)
        .findOne({ where: { id: event.id } });

      this.eventEmitter.emit('event.contribution_created', {
        eventId: event.id,
        contribution: savedContribution,
        newTotal: updatedEvent ? Number(updatedEvent.amountRaised) : undefined,
        contributorName,
      });
    } catch (err) {
      await qr.rollbackTransaction();
      this.logger.error(
        `Failed to process event contribution webhook: ${err.message}`,
        err.stack,
      );
      throw err;
    } finally {
      await qr.release();
    }
  }

  private async processWalletFundingWebhook(
    data: PaystackChargeSuccessData,
  ): Promise<void> {
    const { reference, amount, customer, channel } = data;

    await this.paymentService.verifyTransaction(reference);

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const existingTx = await qr.manager.findOne(Transaction, {
        where: [
          {
            gatewayReference: reference,
            status: TransactionStatus.PENDING,
          },
          { reference: reference, status: TransactionStatus.PENDING },
        ],
      });

      let walletId: string;
      let transactionId: string;
      let amountNaira: number = amount / 100;

      if (existingTx) {
        const claimed = await qr.manager
          .createQueryBuilder()
          .update(Transaction)
          .set({
            status: TransactionStatus.PROCESSING,
            gatewayReference: reference,
            // paymentGateway: 'paystack',
            gatewayResponse: data,
            confirmedAt: new Date(data.paid_at),
            metadata: () =>
              `JSON_MERGE_PATCH(COALESCE(metadata, '{}'), '${JSON.stringify({
                channel,
                senderName: data.authorization?.sender_name ?? null,
                senderBank: data.authorization?.sender_bank ?? null,
                senderAccount:
                  data.authorization?.sender_bank_account_number ?? null,
              })}')`,
          })
          .where('id = :id AND status = :status', {
            id: existingTx.id,
            status: TransactionStatus.PENDING,
          })
          .execute();

        if (claimed.affected === 0) {
          this.logger.warn(
            `Webhook arrived after manual verify for ${reference} — skipping`,
          );
          await qr.rollbackTransaction();
          return;
        }

        walletId = existingTx.walletId as string;
        transactionId = existingTx.id;
        amountNaira = existingTx.amount;
      } else {
        const virtualAccount = await qr.manager.findOne(VirtualAccount, {
          where: { paystackCustomerCode: customer.customer_code },
          relations: ['wallet'],
        });

        if (!virtualAccount) {
          this.logger.error(
            `charge.success — no virtual account for customer ${customer.customer_code} (ref: ${reference})`,
          );
          await qr.rollbackTransaction();
          return;
        }

        if (!virtualAccount.wallet) {
          this.logger.error(
            `charge.success — virtual account ${virtualAccount.id} has no wallet`,
          );
          await qr.rollbackTransaction();
          return;
        }

        walletId = virtualAccount.walletId;

        const newTx = await qr.manager.save(Transaction, {
          walletId,
          amount: amountNaira,
          currency: 'NGN',
          type: TransactionType.WALLET_FUNDING,
          direction: TransactionDirection.CREDIT,
          status: TransactionStatus.PROCESSING,
          reference: `WF-${uuidv4().replace(/-/g, '').substring(0, 16).toUpperCase()}`,
          gatewayReference: reference,
          // paymentGateway: 'paystack',
          description: `Wallet top-up via ${this.channelLabel(channel)}`,
          gatewayResponse: data,
          confirmedAt: new Date(data.paid_at),
          metadata: {
            channel,
            senderName: data.authorization?.sender_name ?? null,
            senderBank: data.authorization?.sender_bank ?? null,
            senderAccount:
              data.authorization?.sender_bank_account_number ?? null,
          },
        });

        transactionId = newTx.id;
      }

      await this.walletService.creditWallet({
        walletId: walletId as string,
        amount: amountNaira,
        transactionId,
        sourceAccountType: LedgerAccountType.PAYMENT_GATEWAY,
        description: `Top-up via ${this.channelLabel(channel)} — ${reference}`,
        qr,
      });

      await qr.manager.update(Transaction, transactionId, {
        status: TransactionStatus.COMPLETED,
      });

      await qr.commitTransaction();

      const wallet = await this.walletRepository.findOne({
        where: { id: walletId },
        relations: ['user'],
      });

      if (wallet?.user) {
        this.eventEmitter.emit('wallet.funded', {
          userId: wallet.user.id,
          amount: amountNaira,
          channel: this.channelLabel(channel),
          pushToken: wallet.user.fcmToken,
        });
      }

      this.logger.log(
        `Wallet credited: ₦${amountNaira} → wallet ${walletId} (ref: ${reference}, path: ${existingTx ? 'card' : 'dva'})`,
      );
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  private async handleTransferSuccess(
    data: PaystackTransferEventData,
  ): Promise<void> {
    const { transfer_code, reference } = data;

    const withdrawal = await this.withdrawalRepo.findOne({
      where: { paymentTransferCode: transfer_code },
      relations: ['transaction', 'wallet'],
    });

    if (!withdrawal) {
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

    const user = await this.userRepository.findOne({
      where: { id: withdrawal.wallet.userId },
    });

    this.eventEmitter.emit('withdrawal.completed', {
      userId: withdrawal.wallet.userId,
      amount: withdrawal.amount,
      transferCode: transfer_code,
    });

    this.logger.log(
      `Withdrawal ${withdrawal.id} completed. Transfer code: ${transfer_code}`,
    );
  }

  private async handleTransferFailed(
    data: PaystackTransferEventData,
  ): Promise<void> {
    const { transfer_code } = data;

    const withdrawal = await this.withdrawalRepo.findOne({
      where: { paymentTransferCode: transfer_code },
      relations: ['transaction', 'wallet'],
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

      await this.walletService.creditWallet({
        walletId: withdrawal.walletId,
        amount: withdrawal.amount,
        transactionId: reversalTx.id,
        sourceAccountType: LedgerAccountType.WITHDRAWAL_TRANSIT,
        description: `Failed transfer reversal — ${transfer_code}`,
        qr,
      });

      await qr.manager.update(WithdrawalRequest, withdrawal.id, {
        status: WithdrawalStatus.FAILED,
        failureReason: `Paystack transfer failed: ${data.reason ?? 'Unknown reason'}`,
      });

      if (withdrawal.transactionId) {
        await qr.manager.update(Transaction, withdrawal.transactionId, {
          status: TransactionStatus.FAILED,
          failureReason: data.reason ?? 'Transfer failed at gateway',
          gatewayResponse: data as Record<string, any>,
        });
      }

      await qr.commitTransaction();

      const user = await this.userRepository.findOne({
        where: { id: withdrawal.wallet.userId },
      });

      this.eventEmitter.emit('withdrawal.failed', {
        userId: withdrawal.wallet.userId,
        amount: withdrawal.amount,
        reason: data.reason || 'Gateway rejection',
      });

      this.logger.warn(
        `Withdrawal ${withdrawal.id} failed. ₦${withdrawal.amount} returned to wallet ${withdrawal.walletId}`,
      );
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  private async handleTransferReversed(
    data: PaystackTransferEventData,
  ): Promise<void> {
    this.logger.warn(
      `Transfer reversed by Paystack: ${data.transfer_code}. Treating as failed.`,
    );
    await this.handleTransferFailed(data);
  }

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

  private extractReference(event: string, data: Record<string, any>): string {
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
