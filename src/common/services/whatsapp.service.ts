import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly axiosInstance: AxiosInstance;
  private readonly phoneNumberId: string;

  private readonly TEMPLATES: Record<string, string> = {
    generic_notification: 'en',
  };

  constructor(private readonly configService: ConfigService) {
    this.phoneNumberId =
      this.configService.getOrThrow<string>('WHATSAPP_PHONE_ID');

    this.axiosInstance = axios.create({
      baseURL: `https://graph.facebook.com/v23.0/${this.phoneNumberId}`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.configService.getOrThrow<string>('WHATSAPP_API_TOKEN')}`,
      },
      timeout: 10_000,
    });
  }

  async sendTemplate(
    to: string,
    title: string,
    body: string,
  ): Promise<WhatsAppSendResult> {
    const templateName = 'generic_notification';
    const languageCode = this.TEMPLATES[templateName];

    if (!languageCode) {
      this.logger.warn(
        `[WhatsApp] Template "${templateName}" not in local registry — skipping`,
      );
      return { success: false, error: 'Template not registered locally' };
    }

    const formattedPhone = this.formatPhone(to);

    const payload = {
      messaging_product: 'whatsapp',
      to: formattedPhone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: this.truncate(title, 512) },
              { type: 'text', text: this.truncate(body, 1024) },
            ],
          },
        ],
      },
    };

    return this.execute(formattedPhone, payload);
  }

  async sendMessage(to: string, message: string): Promise<WhatsAppSendResult> {
    const formattedPhone = this.formatPhone(to);
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'text',
      text: {
        preview_url: false,
        body: this.truncate(message, 4096),
      },
    };
    return this.execute(formattedPhone, payload);
  }

  private formatPhone(phone: string): string {
    return phone.replace(/\D/g, '');
  }

  private truncate(text: string, maxLength: number): string {
    if (!text) return '';
    return text.length > maxLength
      ? text.substring(0, maxLength - 3) + '...'
      : text;
  }

  private async execute(to: string, payload: any): Promise<WhatsAppSendResult> {
    try {
      const response = await this.axiosInstance.post('/messages', payload);
      const messageId = response.data?.messages?.[0]?.id;

      this.logger.log(`[WhatsApp] ✅ Sent to ${to}: ${messageId}`);
      return { success: true, messageId };
    } catch (error) {
      const metaError = error.response?.data?.error;
      const errorCode = metaError?.code;
      const errorMsg = metaError?.message || error.message;

      this.logger.error(
        `[WhatsApp] ❌ Failed for ${to} (code ${errorCode}): ${errorMsg}`,
      );

      return { success: false, error: `(#${errorCode}) ${errorMsg}` };
    }
  }
}
