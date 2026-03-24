export enum TransactionType {
  WALLET_FUNDING = 'wallet_funding', // DVA or card top-up
  WALLET_WITHDRAWAL = 'wallet_withdrawal', // user withdrawal to bank
  CAMPAIGN_DONATION = 'campaign_donation', // wallet → campaign escrow
  CAMPAIGN_SETTLEMENT = 'campaign_settlement', // escrow → campaign owner wallet
  CAMPAIGN_REFUND = 'campaign_refund', // escrow → backer wallet (failed campaign)
  SPLIT_BILL_PAYMENT = 'split_bill_payment', // wallet → bill escrow
  BILL_SETTLEMENT = 'bill_settlement', // bill escrow → vendor/recipient
  INVOICE_PAYMENT = 'invoice_payment', // wallet → invoice recipient
  TRANSFER_IN = 'transfer_in', // internal wallet-to-wallet
  TRANSFER_OUT = 'transfer_out',
  PLATFORM_FEE = 'platform_fee',
  REVERSAL = 'reversal',
  EVENT_DONATION = 'event_donation',
  EVENT_PURCHASE = 'event_purchase',
  EVENT_GIFTING = 'event_gifting',
}

export enum TransactionStatus {
  PENDING = 'pending', // initiated, awaiting confirmation
  PROCESSING = 'processing', // sent to Paystack, awaiting webhook
  COMPLETED = 'completed',
  FAILED = 'failed',
  REVERSED = 'reversed',
  DISPUTED = 'disputed',
}

export enum TransactionDirection {
  CREDIT = 'credit',
  DEBIT = 'debit',
}

export enum LedgerAccountType {
  USER_WALLET = 'user_wallet',
  CAMPAIGN_ESCROW = 'campaign_escrow',
  BILL_ESCROW = 'bill_escrow',
  PLATFORM_REVENUE = 'platform_revenue',
  PAYMENT_GATEWAY = 'payment_gateway', // represents external inflows
  WITHDRAWAL_TRANSIT = 'withdrawal_transit', // funds in-flight to bank
  EVENT_ESCROW = 'event_escrow',
}

export enum VirtualAccountStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum PaystackWebhookEvent {
  CHARGE_SUCCESS = 'charge.success',
  TRANSFER_SUCCESS = 'transfer.success',
  TRANSFER_FAILED = 'transfer.failed',
  TRANSFER_REVERSED = 'transfer.reversed',
  DEDICATEDACCOUNT_ASSIGN = 'dedicatedaccount.assign.success',
}
