export interface FundingAccountResponse {
  accountNumber: string;
  accountName: string;
  bankName: string;
  bankCode: string;
  isAssigned: boolean;
  provisioningPending: boolean;
}

export interface InitiateFundingResponse {
  reference: string;
  authorizationUrl: string;
  accessCode: string;
  amount: number; // kobo
  currency: string;
  channel: string[];
}
