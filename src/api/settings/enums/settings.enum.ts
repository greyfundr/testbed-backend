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
