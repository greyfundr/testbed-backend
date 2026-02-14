import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../entities/notification.entity';
import { SettingsService } from '../../settings';
import { MailtrapService } from './mailtrap.service';
import { FirebaseService } from './firebase.service';
import { TermiiService } from '../../../common/services/termii.service';
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
  ) {}

  async notify(
    userId: string,
    category: keyof NotificationPreferences,
    options: {
      title: string;
      message: string;
      type?: string;
      metadata?: any;
    },
  ) {
    const settings = await this.settingsService.getSettings(userId);
    if (!settings) return;

    const prefs = settings.notificationPrefs[category];
    if (!prefs) return;

    const { title, message, type, metadata } = options;
    const user = { uuid: userId } as any; // Minimal user object for relation

    // 1. In-App Notification (always saved if enabled in prefs, typically inApp is a boolean in our interface)
    if ((prefs as any).inApp) {
      await this.notificationRepository.save({
        user,
        title,
        message,
        type,
        metadata,
      });
    }

    // 2. Push Notification
    if (prefs.push && metadata?.pushToken) {
      await this.firebaseService.sendPushNotification(
        metadata.pushToken,
        title,
        message,
        metadata,
      );
    }

    // 3. Email Notification
    if (prefs.email && metadata?.email) {
      await this.mailtrapService.sendEmail(metadata.email, title, message);
    }

    // 4. SMS Notification
    if ((prefs as any).sms && metadata?.phoneNumber) {
      await this.smsService.sendSMS(metadata.phoneNumber, message);
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
}
