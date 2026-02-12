import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { UpdateSettingsDto } from '../../settings/dtos';
import { SettingsRepository } from '../../settings/repository';
import { ConfigService } from '@nestjs/config';
import { Settings } from '../../settings/entities';
import { NotificationFrequency, ProfileVisibility } from '../enums/user.enum';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  constructor(
    private readonly settingsRepository: SettingsRepository,
    private configService: ConfigService,
  ) {}

  async findOneByid(id: string) {
    return this.settingsRepository.findOne({
      where: { id },
    });
  }

  update(id: number, updateSettingsDto: UpdateSettingsDto) {
    return this.settingsRepository.update(id, updateSettingsDto);
  }

  remove(id: number) {
    return this.settingsRepository.remove(id);
  }

  async getSettings(userId: string): Promise<Settings> {
    try {
      const settings = await this.settingsRepository.findOne({
        where: { user: { id: userId } },
      });

      if (!settings) {
        throw new NotFoundException('Settings not found');
      }

      return settings;
    } catch (error) {
      this.logger.error('Error fetching user settings', error);
      throw error;
    }
  }

  async updateSettings(
    userId: string,
    updateDto: UpdateSettingsDto,
  ): Promise<Settings> {
    const settings = await this.getSettings(userId);

    if (updateDto.notificationPrefs) {
      settings.notificationPrefs = {
        ...settings.notificationPrefs,
        ...updateDto.notificationPrefs,
      };
    }

    if (updateDto.privacyControls) {
      settings.privacyControls = {
        ...settings.privacyControls,
        ...updateDto.privacyControls,
      };
    }

    if (updateDto.language) {
      settings.language = updateDto.language;
    }

    if (updateDto.currency) {
      settings.currency = updateDto.currency;
    }

    return this.settingsRepository.save(settings);
  }

  // async setup2FA(
  //   userId: string,
  //   method: string,
  // ): Promise<{ secret: string; qrCode?: string }> {
  //   const settings = await this.getSettings(userId);

  //   if (settings.twoFactorEnabled) {
  //     throw new BadRequestException('2FA is already enabled');
  //   }

  //   const secret = speakeasy.generateSecret({
  //     name: `GreyFundr (${userId})`,
  //     issuer: 'GreyFundr',
  //   });

  //   settings.twoFactorSecret = secret.base32;

  //   await this.settingsRepository.save(settings);

  //   if (method === 'app') {
  //     const qrCode = await QRCode.toDataURL(secret.otpauth_url);
  //     return { secret: secret.base32, qrCode };
  //   }

  //   return { secret: secret.base32 };
  // }

  // async verify2FA(
  //   userId: string,
  //   code: string,
  // ): Promise<{ backupCodes: string[] }> {
  //   const settings = await this.getSettings(userId);

  //   if (!settings.twoFactorSecret) {
  //     throw new BadRequestException('2FA setup not initiated');
  //   }

  //   const verified = speakeasy.totp.verify({
  //     secret: settings.twoFactorSecret,
  //     encoding: 'base32',
  //     token: code,
  //     window: 2,
  //   });

  //   if (!verified) {
  //     throw new BadRequestException('Invalid verification code');
  //   }

  //   // Generate backup codes
  //   const backupCodes = Array.from({ length: 10 }, () =>
  //     Math.random().toString(36).substring(2, 10).toUpperCase(),
  //   );

  //   settings.twoFactorEnabled = true;

  //   await this.settingsRepository.save(settings);

  //   return { backupCodes };
  // }

  // async disable2FA(userId: string, code: string): Promise<void> {
  //   const settings = await this.getSettings(userId);

  //   if (!settings.twoFactorEnabled) {
  //     throw new BadRequestException('2FA is not enabled');
  //   }

  //   const verified = speakeasy.totp.verify({
  //     secret: settings.twoFactorSecret,
  //     encoding: 'base32',
  //     token: code,
  //     window: 2,
  //   });

  //   settings.twoFactorEnabled = false;
  //   settings.twoFactorSecret = null;

  //   await this.settingsRepository.save(settings);
  // }

  async createDefaultSettings(userId: string): Promise<Settings> {
    const settings = await this.settingsRepository.create({
      user: { id: userId },
      notificationPrefs: {
        campaignUpdates: {
          push: true,
          email: true,
          inApp: true,
          sms: false,
          frequency: NotificationFrequency.REALTIME,
        },
        billReminders: {
          push: true,
          email: true,
          inApp: true,
          sms: true,
          frequency: NotificationFrequency.REALTIME,
        },
        paymentConfirmations: {
          push: true,
          email: true,
          inApp: true,
          sms: true,
        },
        socialInteractions: {
          push: true,
          email: false,
          inApp: true,
          frequency: NotificationFrequency.DAILY,
        },
        trustAndAchievements: {
          push: true,
          email: true,
          inApp: true,
          frequency: NotificationFrequency.REALTIME,
        },
        securityAlerts: {
          push: true,
          email: true,
          inApp: true,
          sms: true,
        },
      },
      privacyControls: {
        profileVisibility: ProfileVisibility.PUBLIC,
        defaultCampaignVisibility: ProfileVisibility.PUBLIC,
        showContributionCount: true,
        showCampaignCount: true,
        showBadges: true,
        showActiveCampaigns: true,
        showTrustScore: true,
        dataSharingConsent: false,
      },
      language: 'en',
      currency: 'NGN',
    });

    return await this.settingsRepository.save(settings);
  }
}
