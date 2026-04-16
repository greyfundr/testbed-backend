// import { Injectable, Logger } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
// import axios, { AxiosInstance } from 'axios';

// @Injectable()
// export class WhatsAppService {
//   private readonly logger = new Logger(WhatsAppService.name);
//   private readonly axiosInstance: AxiosInstance;

//   private readonly phoneNumberId = '984194248121334';
//   // private readonly phoneNumberId =
//   //   this.configService.get<string>('WHATSAPP_PHONE_ID');

//   constructor(private readonly configService: ConfigService) {
//     this.axiosInstance = axios.create({
//       baseURL: 'https://graph.facebook.com/v23.0/',
//       headers: {
//         'Content-Type': 'application/json',
//         Authorization: `Bearer ${this.configService.get<string>('WHATSAPP_API_TOKEN')}`,
//       },
//     });
//   }

//   async sendMessage(to: string, message: string) {
//     const formattedPhoneNumber = to.replace(/\+/g, '');

//     this.logger.log(
//       `Sending WhatsApp message to ${formattedPhoneNumber}...`,
//       this.phoneNumberId,
//     );

//     try {
//       const payload = {
//         messaging_product: 'whatsapp',
//         recipient_type: 'individual',
//         to: formattedPhoneNumber,
//         // type: 'template',
//         // template: {
//         //   name: 'hello_world',
//         //   language: { code: 'en_US' },
//         // },
//         type: 'text',
//         text: {
//           preview_url: false,
//           body: message,
//         },
//       };

//       const response = await this.axiosInstance.post(
//         `${this.phoneNumberId}/messages`,
//         payload,
//       );

//       this.logger.log(
//         `WhatsApp message successfully sent to ${formattedPhoneNumber}: ${response.data?.messages?.[0]?.id}`,
//       );

//       return response.data;
//     } catch (error) {
//       const metaError = error.response?.data?.error?.message || error.message;
//       this.logger.error(
//         `Failed to send WhatsApp message to ${formattedPhoneNumber}: ${metaError}`,
//       );
//     }
//   }
// }

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly axiosInstance: AxiosInstance;
  private readonly phoneNumberId = '984194248121334';

  constructor(private readonly configService: ConfigService) {
    this.axiosInstance = axios.create({
      baseURL: `https://graph.facebook.com/v23.0/${this.phoneNumberId}`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.configService.get<string>('WHATSAPP_API_TOKEN')}`,
      },
    });
  }

  /**
   * Use this for notifications initiated by the system (Reminders, Alerts)
   */
  async sendTemplate(
    to: string,
    title: string,
    body: string,
    linkSuffix?: string,
  ) {
    const payload = {
      messaging_product: 'whatsapp',
      to: to.replace(/\+/g, ''),
      type: 'template',
      template: {
        name: 'generic_notification',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', parameter_name: 'title', text: title },
              { type: 'text', parameter_name: 'message', text: body },
            ],
          },
        ],
      },
    };

    return this.execute(to, payload);
  }

  // async sendTemplate(
  //   to: string,
  //   title: string,
  //   body: string,
  //   linkSuffix: string = '',
  // ) {
  //   const formattedPhone = to.replace(/\+/g, '');

  //   const payload = {
  //     messaging_product: 'whatsapp',
  //     to: formattedPhone,
  //     type: 'template',
  //     template: {
  //       name: 'generic_notification',
  //       language: { code: 'en_US' },
  //       components: [
  //         {
  //           type: 'body',
  //           parameters: [
  //             { type: 'text', text: title },
  //             { type: 'text', text: body },
  //           ],
  //         },
  //         {
  //           type: 'button',
  //           sub_type: 'url',
  //           index: '0',
  //           parameters: [{ type: 'text', text: linkSuffix }],
  //         },
  //       ],
  //     },
  //   };

  //   return this.execute(formattedPhone, payload);
  // }

  /**
   * Use this ONLY if the user has messaged you in the last 24 hours
   */
  async sendMessage(to: string, message: string) {
    const formattedPhone = to.replace(/\+/g, '');
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'text',
      text: { body: message },
    };
    return this.execute(formattedPhone, payload);
  }

  private async execute(to: string, payload: any) {
    try {
      const response = await this.axiosInstance.post('/messages', payload);
      this.logger.log(
        `WhatsApp sent to ${to}: ${response.data?.messages?.[0]?.id}`,
      );
      return response.data;
    } catch (error) {
      const msg = error.response?.data?.error?.message || error.message;
      this.logger.error(`WhatsApp failed for ${to}: ${msg}`);
    }
  }
}
