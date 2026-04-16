import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../entities/notification.entity';
import { SettingsService } from '../../settings';
import { MailtrapService } from './mailtrap.service';
import { FirebaseService } from './firebase.service';
import { TermiiService } from '../../../common/services/termii.service';
import { WhatsAppService } from '../../../common/services/whatsapp.service';
import { NotificationPreferences } from '../../settings';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    private readonly settingsService: SettingsService,
    private readonly mailtrapService: MailtrapService,
    private readonly firebaseService: FirebaseService,
    private readonly smsService: TermiiService,
    private readonly whatsAppService: WhatsAppService,
  ) {}

  async notify(
    userId: string,
    category: keyof NotificationPreferences,
    options: { title: string; message: string; type?: string; metadata?: any },
  ) {
    const settings = await this.settingsService.getSettings(userId);
    if (!settings) return;

    const prefs = settings.notificationPrefs[category];
    if (!prefs) return;

    const { title, message, type, metadata } = options;
    const user = { id: userId } as any;

    if ((prefs as any).inApp) {
      try {
        await this.notificationRepository.save({
          user,
          title,
          message,
          type,
          metadata,
        });
      } catch (e) {
        this.logger.error('In-App Notification failed', e);
      }
    }

    if (prefs.push && metadata?.pushToken) {
      try {
        await this.firebaseService.sendPushNotification(
          metadata.pushToken,
          title,
          message,
          metadata,
        );
      } catch (e) {
        this.logger.error('Push Notification failed', e);
      }
    }

    if ((prefs as any).sms && metadata?.phoneNumber) {
      try {
        await this.smsService.sendSMS(metadata.phoneNumber, message);
      } catch (e) {
        this.logger.error(
          `SMS failed for ${metadata.phoneNumber}: ${e.message}`,
        );
      }
    }

    if (metadata?.phoneNumber) {
      try {
        await this.whatsAppService.sendTemplate(
          metadata.phoneNumber,
          options.title,
          options.message,
        );
      } catch (e) {
        this.logger.error('WhatsApp failed', e);
      }
    }
  }

  async getUserNotifications(userId: string) {
    return this.notificationRepository.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
  }

  async markAsRead(notificationId: number) {
    await this.notificationRepository.update(notificationId, {
      isRead: true,
      readAt: new Date(),
    });
  }

  async notifyAdmin(
    admin: {
      id: string;
      email: string;
      firstName?: string | null;
      phoneNumber?: string;
    },
    options: {
      title: string;
      message: string;
      type?: string;
      metadata?: any;
    },
  ): Promise<void> {
    const { title, message, type, metadata } = options;

    await this.notificationRepository.save({
      user: { id: admin.id },
      title,
      message,
      type,
      metadata,
    });

    // await this.mailtrapService.sendEmail(admin.email, title, message);

    if (admin.phoneNumber) {
      const waMessage = `*Admin Alert: ${title}*\n\n${message}`;
      await this.whatsAppService.sendMessage(admin.phoneNumber, waMessage);
    }
  }

  async notifyAllAdmins(
    admins: Array<{
      id: string;
      email: string;
      firstName?: string | null;
      phoneNumber?: string;
    }>,
    options: {
      title: string;
      message: string;
      type?: string;
      metadata?: any;
    },
  ): Promise<void> {
    if (!admins.length) {
      this.logger.warn('[notifyAllAdmins] No admins to notify.');
      return;
    }

    const results = await Promise.allSettled(
      admins.map((admin) => this.notifyAdmin(admin, options)),
    );

    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length) {
      this.logger.error(
        `[notifyAllAdmins] ${failed.length}/${admins.length} admin notification(s) failed.`,
      );
    }
  }

  async notifyGuest(options: {
    title: string;
    message: string;
    type?: string;
    metadata?: any;
  }) {
    const { title, message, metadata } = options;

    if (metadata?.phoneNumber) {
      try {
        await this.smsService.sendSMS(metadata.phoneNumber, message);
      } catch (e) {
        this.logger.error(
          `SMS failed for ${metadata.phoneNumber}: ${e.message}`,
        );
      }
    }

    if (metadata?.phoneNumber) {
      try {
        await this.whatsAppService.sendTemplate(
          metadata.phoneNumber,
          title,
          message,
        );
      } catch (e) {
        this.logger.error(`WhatsApp Guest Notification failed: ${e.message}`);
      }
    }
  }
}
