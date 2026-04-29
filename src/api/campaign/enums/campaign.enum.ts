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
}

export enum CampaignStatus {
  PENDING_APPROVAL = 'pending_approval',
  ACTIVE = 'active',
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
