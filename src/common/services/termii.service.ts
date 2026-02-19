import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { formatPhoneForTermii } from '../helpers';

@Injectable()
export class TermiiService {
  private readonly logger = new Logger(TermiiService.name);
  private readonly axiosInstance: AxiosInstance;

  constructor(private readonly configService: ConfigService) {
    this.axiosInstance = axios.create({
      baseURL: this.configService.get<string>('TERMII_BASE_URL'),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async sendSMS(to: string, sms: string): Promise<any> {
    try {
      const formattedNumber = formatPhoneForTermii(to);

      const payload = {
        api_key: this.configService.get<string>('TERMII_API_KEY'),
        to,
        from: this.configService.get<string>('TERMII_SENDER_ID'),
        sms,
        type: 'plain',
        channel: 'generic',
      };

      const response = await this.axiosInstance.post('/api/sms/send', payload);
      this.logger.log(`SMS sent to ${to}: ${JSON.stringify(response.data)}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Error sending SMS to ${to}`, error);
      throw error;
    }
  }
}
