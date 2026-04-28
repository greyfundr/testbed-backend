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
  NATIONAL_ID = 'national_id',
}

export enum KycStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
}

export enum KycLevels {
  LEVEL_1 = 'level_1',
  LEVEL_2 = 'level_2',
  LEVEL_3 = 'level_3',
}

export enum FriendRequestStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}
