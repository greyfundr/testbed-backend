import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../entities/notification.entity';
import { SettingsService } from '../../settings';
import { MailtrapService } from './mailtrap.service';
import { FirebaseService } from './firebase.service';
import { TermiiService } from '../../../common/services/termii.service';
import { WhatsAppService } from '../../../common/services/whatsapp.service';
import { NotificationPreferences } from '../../settings';
import {
  GetNotificationsDto,
  MarkNotificationsReadDto,
} from '../dtos/notification.dto';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    private readonly settingsService: SettingsService,
    private readonly mailtrapService: MailtrapService,
    private readonly firebaseService: FirebaseService,
    private readonly termiiService: TermiiService,
    private readonly whatsAppService: WhatsAppService,
  ) {}

  private readonly ALWAYS_INAPP_TYPES = new Set([
    'security',
    'kyc',
    'transaction',
    'split_bill',
    'campaign',
    'event',
  ]);
  private readonly SENSITIVE_TYPES = new Set(['auth', 'account']);

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

    const isSensitive = type ? this.SENSITIVE_TYPES.has(type) : false;
    const forceInApp = type ? this.ALWAYS_INAPP_TYPES.has(type) : false;

    if (!isSensitive && (forceInApp || (prefs as any).inApp)) {
      try {
        await this.notificationRepository.save({
          user: { id: userId },
          title,
          message,
          type,
          metadata,
        });
      } catch (e) {
        this.logger.error('In-App Notification failed', e);
      }
    }

    if (forceInApp || (prefs as any).inApp) {
      try {
        await this.notificationRepository.save({
          user: { id: userId },
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
        await this.termiiService.sendSMS(metadata.phoneNumber, message);
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

    if (['account', 'auth'].includes(type as string) && metadata?.email) {
      try {
        await this.termiiService.sendEmail(
          metadata.category,
          metadata.email,
          title,
          metadata,
        );
      } catch (e) {
        this.logger.error(`Email failed for ${metadata.email}: ${e.message}`);
      }
    }
  }

  async getUserNotifications(
    userId: string,
    dto: GetNotificationsDto,
  ): Promise<{
    notifications: Notification[];
    total: number;
    unreadCount: number;
    page: number;
    totalPages: number;
  }> {
    const { page = 1, limit = 20, isRead, type } = dto;

    const qb = this.notificationRepository
      .createQueryBuilder('n')
      .where('n.user_id = :userId', { userId })
      .orderBy('n.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (isRead !== undefined) {
      qb.andWhere('n.isRead = :isRead', { isRead });
    }

    if (type) {
      qb.andWhere('n.type = :type', { type });
    }

    const [notifications, total] = await qb.getManyAndCount();

    const unreadCount = await this.notificationRepository.count({
      where: { user: { id: userId }, isRead: false },
    });

    return {
      notifications,
      total,
      unreadCount,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async markAsRead(
    userId: string,
    dto: MarkNotificationsReadDto,
  ): Promise<{ updated: number }> {
    if (dto.ids?.length) {
      const result = await this.notificationRepository
        .createQueryBuilder()
        .update(Notification)
        .set({ isRead: true, readAt: new Date() })
        .where('id IN (:...ids)', { ids: dto.ids })
        .andWhere('user_id = :userId', { userId })
        .execute();

      return { updated: result.affected ?? 0 };
    }

    const result = await this.notificationRepository
      .createQueryBuilder()
      .update(Notification)
      .set({ isRead: true, readAt: new Date() })
      .where('user_id = :userId', { userId })
      .andWhere('isRead = false')
      .execute();

    return { updated: result.affected ?? 0 };
  }

  async deleteNotification(
    userId: string,
    notificationId: string,
  ): Promise<void> {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId, user: { id: userId } },
    });

    if (!notification) throw new NotFoundException('Notification not found');

    await this.notificationRepository.delete(notificationId);
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
        await this.termiiService.sendSMS(metadata.phoneNumber, message);
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
