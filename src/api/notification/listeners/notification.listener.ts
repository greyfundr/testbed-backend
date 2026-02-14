import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationService } from '../services/notification.service';

@Injectable()
export class NotificationListener {
  private readonly logger = new Logger(NotificationListener.name);

  constructor(private readonly notificationService: NotificationService) {}

  @OnEvent('user.created')
  async handleUserCreatedEvent(payload: {
    userId: string;
    email: string;
    phoneNumber?: string;
  }) {
    this.logger.log(`Handling user.created event for ${payload.userId}`);
    await this.notificationService.notify(payload.userId, 'securityAlerts', {
      title: 'Welcome to Greyfundr!',
      message: 'Your account has been successfully created.',
      type: 'account',
      metadata: {
        email: payload.email,
        phoneNumber: payload.phoneNumber,
      },
    });
  }

  @OnEvent('security.login')
  async handleSecurityLoginEvent(payload: {
    userUuid: string;
    email: string;
    location?: string;
  }) {
    this.logger.log(`Handling security.login event for ${payload.userUuid}`);
    await this.notificationService.notify(payload.userUuid, 'securityAlerts', {
      title: 'New Login Detected',
      message: `A new login was detected for your account${payload.location ? ` from ${payload.location}` : ''}.`,
      type: 'security',
      metadata: {
        email: payload.email,
      },
    });
  }

  @OnEvent('campaign.live')
  async handleCampaignLiveEvent(payload: {
    userUuid: string;
    campaignName: string;
    email: string;
  }) {
    this.logger.log(`Handling campaign.live event for ${payload.userUuid}`);
    await this.notificationService.notify(payload.userUuid, 'campaignUpdates', {
      title: 'Campaign Live!',
      message: `Your campaign "${payload.campaignName}" is now live and accepting donations.`,
      type: 'campaign',
      metadata: {
        email: payload.email,
      },
    });
  }
}
