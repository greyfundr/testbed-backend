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
      const payload = {
        api_key: this.configService.get<string>('TERMII_API_KEY'),
        to,
        from: this.configService.get<string>('TERMII_SENDER_ID'),
        sms,
        type: 'plain',
        channel: 'generic',
      };

      const response = await this.axiosInstance.post('/api/sms/send', payload);
      return response.data;
    } catch (error) {
      this.logger.error(`Termii SMS Failed: ${error.message}`);
      return null;
    }
  }

  async sendEmail(
    type: string,
    to: string,
    subject: string,
    variables: Record<string, unknown>,
  ): Promise<any> {
    try {
      let template_id;

      switch (type) {
        case 'welcome':
          template_id = this.configService.get<string>(
            'TERMII_WELCOME_EMAIL_TEMPLATE_ID',
          );
          break;
        case 'verifyOtp':
          template_id = this.configService.get<string>(
            'TERMII_VERIFY_OTP_EMAIL_TEMPLATE_ID',
          );
          break;
        case 'passwordReset':
          template_id = this.configService.get<string>(
            'TERMII_PASSWORD_RESET_EMAIL_TEMPLATE_ID',
          );
          break;
        case 'walletFunding':
          template_id = this.configService.get<string>(
            'TERMII_WALLET_FUNDING_EMAIL_TEMPLATE_ID',
          );
          break;
        default:
          throw new Error(`Unknown email type: ${type}`);
      }

      const payload = {
        api_key: this.configService.get<string>('TERMII_API_KEY'),
        email: to,
        subject,
        template_id: template_id,
        variables,
        email_configuration_id: this.configService.get<string>(
          'TERMII_EMAIL_CONFIG_ID',
        ),
      };

      const response = await this.axiosInstance.post(
        '/api/templates/send-email',
        payload,
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Termii Email Failed: ${error.response?.data?.message || error.message}`,
      );
      return null;
    }
  }
}
