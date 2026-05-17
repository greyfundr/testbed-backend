export enum CampaignCategory {
  MEDICAL = 'medical',
  EDUCATION = 'education',
  TRAVEL = 'travel',
  NATURE = 'nature',
  ANIMAL = 'animal',
  SOCIAL = 'social',
  DISASTER = 'disaster',
  RELIGION = 'religion',
  BUSINESS = 'business',
  WEDDINGS = 'weddings',
  MEMORIAL = 'memorial',
  SPORTS = 'sports',
  EMERGENCY = 'emergency',
  ARTS = 'arts',
  COMMUNITY = 'community',
}

export enum CampaignStatus {
  PENDING_APPROVAL = 'pending_approval',
  ACTIVE = 'active',
  PAUSED = 'paused',
  REJECTED = 'rejected',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

export enum OfferType {
  AUTO = 'auto',
  MANUAL = 'manual',
}

export enum DonationOnBehalfOf {
  SELF = 'self',
  USER = 'user',
  EXTERNAL = 'external',
}

export enum ApprovalThresholdMode {
  AUTO = 'auto',
  MANUAL = 'manual',
}

export enum CampaignVendorKind {
  VENDOR = 'vendor',
  INDIVIDUAL = 'individual',
  INTERNAL = 'internal',
}

export enum ProposalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXECUTED = 'executed',
  CANCELLED = 'cancelled',
}

export enum ProposalVoteValue {
  APPROVE = 'approve',
  REJECT = 'reject',
}
