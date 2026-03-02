import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService {
  private readonly logger = new Logger(FirebaseService.name);

  constructor(private readonly configService: ConfigService) {
    if (!admin.apps.length) {
      const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
      const clientEmail = this.configService.get<string>(
        'FIREBASE_CLIENT_EMAIL',
      );

      const privateKey = this.configService
        .get<string>('FIREBASE_PRIVATE_KEY')
        ?.replace(/\\n/g, '\n');

      if (!projectId || !clientEmail || !privateKey) {
        this.logger.warn(
          'Firebase credentials missing in environment variables. Initialization skipped.',
        );
        return;
      }

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });

      this.logger.log('Firebase Admin initialized successfully');
    }
  }

  async sendPushNotification(
    token: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<{ success: boolean; messageId: string }> {
    try {
      this.logger.log(`Sending push notification to ${token}: ${title}`);

      const message: admin.messaging.Message = {
        notification: { title, body },
        data: data || {},
        token: token,
      };

      const messageId = await admin.messaging().send(message);

      this.logger.log(`Successfully sent message with ID: ${messageId}`);
      return { success: true, messageId };
    } catch (error) {
      this.logger.error(
        `Failed to send push notification to ${token}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
