export enum AccountType {
  PERSONAL = 'personal',
  COMMUNITY = 'community',
  BUSINESS = 'business',
  GROUP = 'group',
}

export enum ProfileVisibility {
  PUBLIC = 'public',
  CONNECTIONS = 'connections',
  PRIVATE = 'private',
}

export enum NotificationFrequency {
  REALTIME = 'realtime',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  OFF = 'off',
}

export enum NotificationChannel {
  PUSH = 'push',
  EMAIL = 'email',
  SMS = 'sms',
  IN_APP = 'in_app',
}

export enum TwoFactorMethod {
  APP = 'app',
  SMS = 'sms',
  EMAIL = 'email',
}

export enum KycVerificationType {
  BVN = 'bvn',
  NIN = 'nin',
  PASSPORT = 'passport',
  DRIVERS_LICENSE = 'drivers_license',
  VOTERS_CARD = 'voters_card',
}

export enum KycStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
}
