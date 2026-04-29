import { HttpException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { catchError, firstValueFrom, retry } from 'rxjs';
import { AxiosError } from 'axios';

@Injectable()
export class UserKycService {
  private readonly logger = new Logger(UserKycService.name);
  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(HttpService) private readonly httpService: HttpService,
  ) {}

  async createDiditSession(payload): Promise<Record<string, any>> {
    const headers = {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-api-key': this.configService.get<string>('DIDIT_API_KEY'),
    };

    const workflow_id = this.configService.get<string>('DIDIT_WORKFLOW_ID');

    const sessionPayload = {
      workflow_id,
      vendor_data: payload.id,
      callback: 'https://greyfundr.com/didit/session/success',
    };

    const details = this.httpService
      .post(
        `${this.configService.get<string>('DIDIT_BASE_URL')}/session`,
        sessionPayload,
        {
          headers,
        },
      )
      .pipe(
        catchError((error: AxiosError) => {
          this.logger.error(error);
          const errorData = error.response?.data as Record<string, any>;
          throw new HttpException(
            { statusCode: error.response?.status, ...errorData },
            error.response?.status || 500,
            {
              cause: error,
            },
          );
        }),
        retry({
          count: 3,
          delay: 5000,
          resetOnSuccess: true,
        }),
      );
    const { data } = await firstValueFrom(details);
    return data;
  }
}
