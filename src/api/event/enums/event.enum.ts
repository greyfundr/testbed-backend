export enum EventStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum EventContributionType {
  DONATION = 'donation',
  PURCHASE = 'purchase',
  GIFTING = 'gifting',
}

export enum EventOrganizerRole {
  OWNER = 'owner',
  CO_ORGANIZER = 'co-organizer',
  COLLECTOR = 'collector',
}

export enum EventPaymentMethod {
  WALLET = 'wallet',
  PAYSTACK = 'paystack',
}
