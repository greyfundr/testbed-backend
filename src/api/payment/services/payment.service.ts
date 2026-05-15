import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  PaystackCustomerResponse,
  PaystackDVAResponse,
  PaystackTransferRecipientResponse,
  PaystackTransferResponse,
  PaystackResolveAccountResponse,
  PaystackRefundResponse,
  PaystackInitializeTransactionResponse,
} from '../interfaces/payment.interface';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly client: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    const secretKey = this.config.get<string>('PAYSTACK_SECRET_KEY');

    this.client = axios.create({
      baseURL: 'https://api.paystack.co',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    });

    // Response interceptor for unified error handling
    this.client.interceptors.response.use(
      (res) => res,
      (error: AxiosError<{ message: string; status: boolean }>) => {
        const message =
          error.response?.data?.message ??
          error.message ??
          'Paystack request failed';
        this.logger.error(`Paystack API error: ${message}`, {
          status: error.response?.status,
          url: error.config?.url,
          data: error.response?.data,
        });
        throw new InternalServerErrorException(
          `Payment gateway error: ${message}`,
        );
      },
    );
  }

  // ─── Customer ───────────────────────────────────────────────────────────────

  /**
   * Creates a Paystack customer — required before provisioning a DVA.
   * Called once per user at KYC completion.
   */
  async createCustomer(params: {
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
  }): Promise<PaystackCustomerResponse['data']> {
    const { data } = await this.client.post<PaystackCustomerResponse>(
      '/customer',
      {
        email: params.email,
        first_name: params.firstName,
        last_name: params.lastName,
        phone: params.phone,
      },
    );
    return data.data;
  }

  /**
   * Validates customer identity with NIN or BVN.
   * Must be called before DVA assignment for Tier-2 limits.
   */
  async validateCustomer(params: {
    customerCode: string;
    country: string;
    type: 'bvn' | 'bank_account';
    value: string;
    firstName: string;
    lastName: string;
  }): Promise<boolean> {
    const { data } = await this.client.post(
      `/customer/${params.customerCode}/identification`,
      {
        country: params.country,
        type: params.type,
        value: params.value,
        first_name: params.firstName,
        last_name: params.lastName,
      },
    );
    return data.status;
  }

  // ─── Dedicated Virtual Accounts ─────────────────────────────────────────────

  /**
   * Assigns a dedicated NUBAN virtual account to a customer.
   * Each user gets one account number permanently tied to their profile.
   */
  async createDedicatedVirtualAccount(params: {
    customer: string;
    preferredBank?:
      | 'wema-bank'
      | 'titan-paystack'
      | 'access-bank'
      | 'test-bank';
  }): Promise<PaystackDVAResponse['data']> {
    const { data } = await this.client.post<PaystackDVAResponse>(
      '/dedicated_account',
      {
        customer: params.customer,
        preferred_bank: params.preferredBank ?? 'wema-bank',
      },
    );
    return data.data;
  }

  /**
   * Fetches a dedicated account by ID — used to verify assignment status.
   */
  async getDedicatedVirtualAccount(
    dedicatedAccountId: string,
  ): Promise<PaystackDVAResponse['data']> {
    const { data } = await this.client.get<PaystackDVAResponse>(
      `/dedicated_account/${dedicatedAccountId}`,
    );
    return data.data;
  }

  // ─── Account Resolution ──────────────────────────────────────────────────────

  /**
   * Resolves a bank account number to get the account name.
   * Always call before creating a transfer recipient.
   */
  async resolveAccountNumber(params: {
    accountNumber: string;
    bankCode: string;
  }): Promise<PaystackResolveAccountResponse['data']> {
    const { data } = await this.client.get<PaystackResolveAccountResponse>(
      '/bank/resolve',
      {
        params: {
          account_number: params.accountNumber,
          bank_code: params.bankCode,
        },
      },
    );
    return data.data;
  }

  /**
   * Fetches the list of supported Nigerian banks.
   */
  async getBanks(
    country = 'nigeria',
  ): Promise<Array<{ name: string; code: string; slug: string }>> {
    const { data } = await this.client.get('/bank', {
      params: { country, per_page: 200 },
    });
    return data.data;
  }

  // ─── Transactions  ─────────────────────────────────────────────────────

  /**
   * Initiates a transaction to the virtual account number on paystack.
   * Requires OTP confirmation if 2FA is enabled on the Paystack dashboard.
   *
   * @param idempotencyKey - Unique key to prevent duplicate transactions. Pass your
   *                         withdrawal request ID. Paystack will return the same
   *                         response if the same key is reused.
   */
  async initiateTransactions(body: {
    amount: number;
    email: string;
    reference: string;
    reason?: string;
    metadata?: Record<any, any>;
  }): Promise<PaystackInitializeTransactionResponse> {
    const { email, reference, metadata, amount } = body;
    const { data } =
      await this.client.post<PaystackInitializeTransactionResponse>(
        '/transaction/initialize',
        {
          email,
          amount,
          reference,
          currency: 'NGN',
          channels: [
            'card',
            'bank',
            'ussd',
            'qr',
            'mobile_money',
            'bank_transfer',
          ],
          metadata,
          callback_url: `https://greyfundr.com/paystack/success`,
        },
      );
    return data;
  }

  // ─── Transfer Recipients ─────────────────────────────────────────────────────

  /**
   * Creates a transfer recipient for a user's bank account.
   * Store the recipient_code — it's reused for all future payouts to that account.
   */
  async createTransferRecipient(params: {
    name: string;
    accountNumber: string;
    bankCode: string;
    currency?: string;
    description?: string;
  }): Promise<PaystackTransferRecipientResponse['data']> {
    const { data } = await this.client.post<PaystackTransferRecipientResponse>(
      '/transferrecipient',
      {
        type: 'nuban',
        name: params.name,
        account_number: params.accountNumber,
        bank_code: params.bankCode,
        currency: params.currency ?? 'NGN',
        description: params.description,
      },
    );
    return data.data;
  }

  // ─── Transfers (Payouts) ─────────────────────────────────────────────────────

  /**
   * Initiates a transfer (payout) to a bank account via Paystack Transfer API.
   * Requires OTP confirmation if 2FA is enabled on the Paystack dashboard.
   *
   * @param idempotencyKey - Unique key to prevent duplicate transfers. Pass your
   *                         withdrawal request ID. Paystack will return the same
   *                         response if the same key is reused.
   */
  async initiateTransfer(params: {
    amount: number;
    recipientCode: string;
    reference: string;
    reason?: string;
  }): Promise<PaystackTransferResponse['data']> {
    const { data } = await this.client.post<PaystackTransferResponse>(
      '/transfer',
      {
        source: 'balance',
        amount: params.amount,
        recipient: params.recipientCode,
        reference: params.reference,
        reason: params.reason ?? 'Wallet withdrawal',
        currency: 'NGN',
      },
    );
    return data.data;
  }

  /**
   * Fetches the current status of a transfer.
   * Use this to reconcile if a webhook is missed.
   */
  async getTransfer(
    transferCode: string,
  ): Promise<PaystackTransferResponse['data']> {
    const { data } = await this.client.get<PaystackTransferResponse>(
      `/transfer/${transferCode}`,
    );
    return data.data;
  }

  // ─── Refunds ────────────────────────────────────────────────────────────────

  /**
   * Refunds a completed charge back to the original payment method.
   * Used for failed campaigns where users paid via card rather than wallet.
   */
  async refundTransaction(params: {
    transaction: string; // Paystack transaction reference
    amount?: number; // partial refund in kobo; omit for full refund
  }): Promise<PaystackRefundResponse['data']> {
    const { data } = await this.client.post<PaystackRefundResponse>('/refund', {
      transaction: params.transaction,
      amount: params.amount,
    });
    return data.data;
  }

  // ─── Webhook Verification ────────────────────────────────────────────────────

  /**
   * Verifies Paystack webhook signature using HMAC-SHA512.
   * ALWAYS call this before processing any webhook payload.
   * Reject with 401 if verification fails — never process unverified webhooks.
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    const crypto = require('crypto');
    const secretKey = this.config.getOrThrow<string>('PAYSTACK_SECRET_KEY');
    const hash = crypto
      .createHmac('sha512', secretKey)
      .update(payload)
      .digest('hex');
    return hash === signature;
  }

  // ─── Transaction Verification ────────────────────────────────────────────────

  /**
   * Verifies a charge transaction directly from Paystack.
   * Use to double-check webhook data before crediting — defence in depth.
   */
  async verifyTransaction(reference: string): Promise<{
    status: string;
    amount: number;
    currency: string;
    reference: string;
    paid_at: Date;
    channel: string;
    customer: { customer_code: string; email: string };
    metadata?: Record<string, any>;
  }> {
    const { data } = await this.client.get(`/transaction/verify/${reference}`);
    if (!data.status || data.data.status !== 'success') {
      throw new BadRequestException(
        `Transaction ${reference} is not successful on Paystack`,
      );
    }
    return data.data;
  }
}
