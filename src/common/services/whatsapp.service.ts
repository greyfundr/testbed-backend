import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly axiosInstance: AxiosInstance;

  private readonly phoneNumberId = '984194248121334';
  // private readonly phoneNumberId =
  //   this.configService.get<string>('WHATSAPP_PHONE_ID');

  constructor(private readonly configService: ConfigService) {
    this.axiosInstance = axios.create({
      baseURL: 'https://graph.facebook.com/v23.0/',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.configService.get<string>('WHATSAPP_API_TOKEN')}`,
      },
    });
  }

  async sendMessage(to: string, message: string) {
    const formattedPhoneNumber = to.replace(/\+/g, '');

    this.logger.log(
      `Sending WhatsApp message to ${formattedPhoneNumber}...`,
      this.phoneNumberId,
    );

    try {
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhoneNumber,
        // type: 'template',
        // template: {
        //   name: 'hello_world',
        //   language: { code: 'en_US' },
        // },
        type: 'text',
        text: {
          preview_url: false,
          body: message,
        },
      };

      const response = await this.axiosInstance.post(
        `${this.phoneNumberId}/messages`,
        payload,
      );

      this.logger.log(
        `WhatsApp message successfully sent to ${formattedPhoneNumber}: ${response.data?.messages?.[0]?.id}`,
      );

      return response.data;
    } catch (error) {
      const metaError = error.response?.data?.error?.message || error.message;
      this.logger.error(
        `Failed to send WhatsApp message to ${formattedPhoneNumber}: ${metaError}`,
      );
    }
  }
}
