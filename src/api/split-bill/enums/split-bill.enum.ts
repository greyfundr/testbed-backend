export enum SplitMethod {
  EVEN = 'EVEN', // divide equally among all participants
  MANUAL = 'MANUAL', // creator sets each participant's exact amount
  PERCENTAGE = 'PERCENTAGE', // each participant assigned a percentage
}

export enum SplitBillStatus {
  DRAFT = 'draft', // created but not yet sent to participants
  ACTIVE = 'active', // sent, accepting payments
  PARTIALLY_PAID = 'partially_paid', // some participants paid, not all
  FUNDED = 'funded', // all participants paid, pending settlement
  SETTLED = 'settled', // funds released to recipient/vendor
  CANCELLED = 'cancelled',
  OVERDUE = 'overdue', // past due_date, not fully paid
  DISPUTED = 'disputed', // flagged, funds held
}

export enum ParticipantStatus {
  INVITED = 'invited', // added to bill, not yet accepted
  ACCEPTED = 'accepted', // accepted the invite
  DECLINED = 'declined', // declined
  UNPAID = 'unpaid', // accepted, hasn't paid
  PARTIAL = 'partial', // paid some
  PAID = 'paid', // fully paid their share
  OVERDUE = 'overdue', // past due date, unpaid
  WAIVED = 'waived', // creator waived their share (e.g. the organiser)
}

export enum ParticipantRole {
  CREATOR = 'creator', // created the bill — may or may not owe a share
  PARTICIPANT = 'participant', // regular contributor
  RECIPIENT = 'recipient', // receives the settled funds (can be external vendor)
}

export enum SettlementTarget {
  WALLET = 'wallet', // release escrow to a GreyFundr wallet
  BANK_ACCOUNT = 'bank_account', // transfer to external bank account via Paystack
  VENDOR = 'vendor', // direct vendor settlement (vendor has GreyFundr account)
}

export enum ActivityActionType {
  CREATED = 'created',
  UPDATED = 'updated',
  AMOUNT_INCREASED = 'amount_increased',
  AMOUNT_DECREASED = 'amount_decreased',
  PARTICIPANT_ADDED = 'participant_added',
  PARTICIPANT_REMOVED = 'participant_removed',
  PARTICIPANT_ACCEPTED = 'participant_accepted',
  PARTICIPANT_DECLINED = 'participant_declined',
  PAYMENT_MADE = 'payment_made',
  PAYMENT_REFUNDED = 'payment_refunded',
  SHARES_RECALCULATED = 'shares_recalculated',
  BILL_FINALIZED = 'bill_finalized',
  BILL_FUNDED = 'bill_funded',
  SETTLEMENT_INITIATED = 'settlement_initiated',
  SETTLEMENT_COMPLETED = 'settlement_completed',
  CANCELLED = 'cancelled',
  DISPUTED = 'disputed',
  DISPUTE_RESOLVED = 'dispute_resolved',
  REMINDER_SENT = 'reminder_sent',
  OVERDUE_MARKED = 'overdue_marked',
}

// export enum SplitMethod {
//   EVEN = 'EVEN',
//   MANUAL = 'MANUAL',
//   PERCENTAGE = 'PERCENTAGE',
// }

// export enum SplitBillStatus {
//   DRAFT = 'draft',
//   ACTIVE = 'active',
//   PARTIALLY_PAID = 'partially_paid',
//   FUNDED = 'funded',
//   SETTLED = 'settled',
//   CANCELLED = 'cancelled',
//   DISPUTED = 'disputed',
// }

// export enum ParticipantStatus {
//   INVITED = 'INVITED',
//   ACCEPTED = 'ACCEPTED',
//   DECLINED = 'DECLINED',
//   UNPAID = 'UNPAID',
//   PARTIAL = 'PARTIAL',
//   PAID = 'PAID',
//   WAIVED = 'WAIVED',
// }

// export enum ParticipantRole {
//   CREATOR = 'creator',
//   PARTICIPANT = 'participant',
//   RECIPIENT = 'recipient',
// }

// export enum ActivityActionType {
//   CREATED = 'created',
//   UPDATED = 'updated',
//   CANCELLED = 'cancelled',
//   BILL_FUNDED = 'bill_funded',
//   BILL_FINALIZED = 'bill_finalized',
//   PAYMENT_MADE = 'payment_made',
//   PARTICIPANT_ADDED = 'participant_added',
//   PARTICIPANT_REMOVED = 'participant_removed',
//   PARTICIPANT_ACCEPTED = 'participant_accepted',
//   PARTICIPANT_DECLINED = 'participant_declined',
//   REMINDER_SENT = 'reminder_sent',
//   SETTLED = 'settled',
//   DISPUTED = 'disputed',
// }