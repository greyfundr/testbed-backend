import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import {
  NotificationFrequency,
  ProfileVisibility,
  TwoFactorMethod,
} from '../enums/settings.enum';
import {
  NotificationPreferences,
  PrivacyControls,
} from '../interface/settings.interface';

export class CreateSettingsDto { }

export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  campaignUpdates?: {
    push: boolean;
    email: boolean;
    inApp: boolean;
    sms: boolean;
    frequency: NotificationFrequency;
  };

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  billReminders?: {
    push: boolean;
    email: boolean;
    inApp: boolean;
    sms: boolean;
    frequency: NotificationFrequency;
  };

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  paymentConfirmations?: {
    push: boolean;
    email: boolean;
    inApp: boolean;
    sms: boolean;
  };

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  socialInteractions?: {
    push: boolean;
    email: boolean;
    inApp: boolean;
    frequency: NotificationFrequency;
  };

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  trustAndAchievements?: {
    push: boolean;
    email: boolean;
    inApp: boolean;
    frequency: NotificationFrequency;
  };
}

export class UpdatePrivacyControlsDto {
  @ApiPropertyOptional({ enum: ProfileVisibility })
  @IsOptional()
  @IsEnum(ProfileVisibility)
  profileVisibility?: ProfileVisibility;

  @ApiPropertyOptional({ enum: ProfileVisibility })
  @IsOptional()
  @IsEnum(ProfileVisibility)
  defaultCampaignVisibility?: ProfileVisibility;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showContributionCount?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showCampaignCount?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showBadges?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showActiveCampaigns?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showTrustScore?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  dataSharingConsent?: boolean;
}

export class UpdateSettingsDto {
  @ApiPropertyOptional({
    example: {
      campaignUpdates: {
        push: true,
        email: true,
        inApp: true,
        sms: false,
        frequency: 'realtime',
      },
      paymentConfirmations: {
        push: true,
        email: true,
        inApp: true,
        sms: true,
      },
      trustAndAchievements: {
        push: true,
        email: true,
        inApp: true,
        frequency: 'daily',
      },
    },
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateNotificationPreferencesDto)
  notificationPrefs?: Partial<NotificationPreferences>;

  @ApiPropertyOptional({
    example: {
      profileVisibility: 'public',
      defaultCampaignVisibility: 'connections',
      showContributionCount: true,
      showCampaignCount: true,
      showBadges: true,
      showActiveCampaigns: true,
      showTrustScore: true,
      dataSharingConsent: true,
    },
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdatePrivacyControlsDto)
  privacyControls?: Partial<PrivacyControls>;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ example: 'NGN' })
  @IsOptional()
  @IsString()
  currency?: string;
}

export class Enable2FADto {
  @IsEnum(TwoFactorMethod)
  method: TwoFactorMethod;
}

export class Verify2FADto {
  @IsString()
  code: string;
}
