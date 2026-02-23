import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class MailtrapService {
  private readonly logger = new Logger(MailtrapService.name);
  private readonly axiosInstance: AxiosInstance;

  constructor(private readonly configService: ConfigService) {
    this.axiosInstance = axios.create({
      baseURL: 'https://send.api.mailtrap.io/api',
      headers: {
        Authorization: `Bearer ${this.configService.get<string>('MAILTRAP_API_TOKEN')}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async sendEmail(to: string, subject: string, html: string): Promise<any> {
    try {
      const payload = {
        from: {
          email: this.configService.get<string>('MAILTRAP_SENDER_EMAIL'),
          name: this.configService.get<string>('MAILTRAP_SENDER_NAME'),
        },
        to: [{ email: to }],
        subject,
        html,
        category: 'Notification',
      };

      const response = await this.axiosInstance.post('/send', payload);
      this.logger.log(`Email sent to ${to}: ${JSON.stringify(response.data)}`);
      return response.data;
    } catch (error) {
      this.logger.error(
        `Error sending email to ${to}`,
        error.response?.data || error,
      );
      throw error;
    }
  }
}
