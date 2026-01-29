import { NotificationFrequency, ProfileVisibility } from '../enums/user.enum';

export interface NotificationPreferences {
  campaignUpdates: {
    push: boolean;
    email: boolean;
    inApp: boolean;
    sms: boolean;
    frequency: NotificationFrequency;
  };
  billReminders: {
    push: boolean;
    email: boolean;
    inApp: boolean;
    sms: boolean;
    frequency: NotificationFrequency;
  };
  paymentConfirmations: {
    push: boolean;
    email: boolean;
    inApp: boolean;
    sms: boolean;
  };
  socialInteractions: {
    push: boolean;
    email: boolean;
    inApp: boolean;
    frequency: NotificationFrequency;
  };
  trustAndAchievements: {
    push: boolean;
    email: boolean;
    inApp: boolean;
    frequency: NotificationFrequency;
  };
  securityAlerts: {
    push: boolean;
    email: boolean;
    inApp: boolean;
    sms: boolean;
  };
}

export interface PrivacyControls {
  profileVisibility: ProfileVisibility;
  defaultCampaignVisibility: ProfileVisibility;
  showContributionCount: boolean;
  showCampaignCount: boolean;
  showBadges: boolean;
  showActiveCampaigns: boolean;
  showTrustScore: boolean;
  dataSharingConsent: boolean;
}
