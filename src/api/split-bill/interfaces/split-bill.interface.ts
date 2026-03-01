export interface ValidatedParticipant {
  type: 'USER' | 'GUEST';
  userId?: string;
  guestName?: string;
  guestPhone?: string;
  guestEmail?: string;
  amount?: number; // kobo
  percentage?: number; // integer 0-100
}

export interface ShareAdjustment {
  participantId: string;
  participantName: string;
  oldOwed: number;
  newOwed: number;
  amountPaid: number;
  action: 'REFUND_REQUIRED' | 'ADDITIONAL_PAYMENT_REQUIRED' | 'AMOUNT_ADJUSTED';
  message: string;
  overAmount?: number; // kobo
  additionalOwed?: number; // kobo
}

export interface ComputeSharesResult {
  adjustments: ShareAdjustment[];
  hasRefundsRequired: boolean;
  hasAdditionalPaymentsRequired: boolean;
}
