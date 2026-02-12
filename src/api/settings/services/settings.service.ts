import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { UpdateSettingsDto } from '../dtos/settings.dto';
import { SettingsRepository } from '../repository/settings.repository';
import { ConfigService } from '@nestjs/config';
import { Settings } from '../entities/settings.entity';
import {
  NotificationFrequency,
  ProfileVisibility,
} from '../enums/settings.enum';
import { EntityManager } from 'typeorm';

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

  async findByUserId(userId: string): Promise<Settings | null> {
    return this.settingsRepository.findOne({
      where: { user: { id: userId } },
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
      for (const key of Object.keys(updateDto.notificationPrefs)) {
        if (
          updateDto.notificationPrefs[
            key as keyof typeof updateDto.notificationPrefs
          ]
        ) {
          settings.notificationPrefs[
            key as keyof typeof settings.notificationPrefs
          ] = {
            ...((settings.notificationPrefs[
              key as keyof typeof settings.notificationPrefs
            ] as any) || {}),
            ...(updateDto.notificationPrefs[
              key as keyof typeof updateDto.notificationPrefs
            ] as any),
          };
        }
      }
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

  async createDefaultSettings(
    userId: string,
    manager?: EntityManager,
  ): Promise<Settings> {
    const repository = manager
      ? manager.getRepository(Settings)
      : this.settingsRepository;

    const settings = await repository.create({
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

    return repository.save(settings);
  }
}
