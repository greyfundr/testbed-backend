export enum WalletStatus {
  ACTIVE = 'active',
  FROZEN = 'frozen',
  SUSPENDED = 'suspended',
}

export enum WalletCurrency {
  NGN = 'NGN',
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
