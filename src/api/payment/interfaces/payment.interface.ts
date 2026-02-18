export interface PaystackCustomerResponse {
  status: boolean;
  message: string;
  data: {
    id: number;
    customer_code: string;
    email: string;
    phone: string;
    first_name: string;
    last_name: string;
    metadata: Record<string, any>;
  };
}

export interface PaystackDVAResponse {
  status: boolean;
  message: string;
  data: {
    id: number;
    bank: {
      name: string;
      id: number;
      slug: string;
    };
    account_name: string;
    account_number: string;
    assigned: boolean;
    currency: string;
    assignment: {
      assignee_id: number;
      assignee_type: string;
      account_type: string;
      assigned_at: string;
    };
    customer: {
      id: number;
      first_name: string;
      last_name: string;
      email: string;
      customer_code: string;
      phone: string;
    };
  };
}

export interface PaystackTransferRecipientResponse {
  status: boolean;
  message: string;
  data: {
    active: boolean;
    createdAt: string;
    currency: string;
    description: string;
    domain: string;
    email: string | null;
    id: number;
    integration: number;
    name: string;
    recipient_code: string;
    type: string;
    updatedAt: string;
    is_deleted: boolean;
    details: {
      authorization_code: string | null;
      account_number: string;
      account_name: string;
      bank_code: string;
      bank_name: string;
    };
  };
}

export interface PaystackTransferResponse {
  status: boolean;
  message: string;
  data: {
    reference: string;
    integration: number;
    domain: string;
    amount: number;
    currency: string;
    source: string;
    reason: string;
    recipient: number;
    transfer_code: string;
    id: number;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
}

export interface PaystackResolveAccountResponse {
  status: boolean;
  message: string;
  data: {
    account_number: string;
    account_name: string;
    bank_id: number;
  };
}

export interface PaystackRefundResponse {
  status: boolean;
  message: string;
  data: {
    transaction: number;
    dispute: number;
    refund: boolean;
    status: string;
    currency: string;
    amount: number;
  };
}

// Webhook payload shapes
export interface PaystackChargeSuccessData {
  id: number;
  domain: string;
  status: string;
  reference: string;
  amount: number; // in kobo
  message: string | null;
  gateway_response: string;
  paid_at: string;
  created_at: string;
  channel: string;
  currency: string;
  ip_address: string;
  metadata: Record<string, any>;
  customer: {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    customer_code: string;
    phone: string;
    metadata: Record<string, any>;
    risk_action: string;
    international_format_phone: string | null;
  };
  authorization: {
    authorization_code: string;
    bin: string;
    last4: string;
    exp_month: string;
    exp_year: string;
    channel: string;
    card_type: string;
    bank: string;
    country_code: string;
    brand: string;
    reusable: boolean;
    signature: string;
    account_name: string | null;
    sender_bank: string;
    sender_bank_account_number: string;
    sender_country: string;
    sender_name: string;
    narration: string;
  };
}

export interface PaystackTransferEventData {
  amount: number;
  currency: string;
  domain: string;
  failures: any;
  id: number;
  integration: {
    id: number;
    is_live: boolean;
    business_name: string;
  };
  reason: string;
  reference: string;
  source: string;
  source_details: any;
  status: string;
  titan_code: string | null;
  transfer_code: string;
  request: number | null;
  transferred_at: string | null;
  created_at: string;
  updated_at: string;
  recipient: {
    active: boolean;
    currency: string;
    description: string;
    domain: string;
    email: string | null;
    id: number;
    integration: number;
    metadata: any;
    name: string;
    recipient_code: string;
    type: string;
    is_deleted: boolean;
    details: {
      account_number: string;
      account_name: string;
      bank_code: string;
      bank_name: string;
    };
  };
  session: { provider: string | null; id: string | null };
}
