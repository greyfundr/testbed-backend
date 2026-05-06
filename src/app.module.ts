import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './api/auth/auth.module';
import { CampaignModule } from './api/campaign/campaign.module';
import { ConfigModule } from '@nestjs/config';
import { dataSourceOptions } from './config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from './api/user/user.module';
import { CommonModule } from './common/common.module';
import { SettingsModule } from './api/settings/settings.module';
import { environmentValidationSchema } from './config/env.validation';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { NotificationModule } from './api/notification/notification.module';
import { TransactionModule } from './api/transaction/transaction.module';
import { WalletModule } from './api/wallet/wallet.module';
import { PaymentModule } from './api/payment/payment.module';
import { AdminModule } from './api/admin/admin.module';
import { SplitBillModule } from './api/split-bill/split-bill.module';
import { UploadModule } from './api/upload/upload.module';
import { EventModule } from './api/event/event.module';
import { DynamicLinkModule } from './api/dynamic-link/dynamic-link.module';
import { LoggerModule } from 'nestjs-pino';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema: environmentValidationSchema,
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60,
          limit: 10,
        },
      ],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: () => ({
        ...dataSourceOptions,
      }),
    }),
    // LoggerModule.forRoot({
    //   pinoHttp: {
    //     autoLogging: true,
    //     transport:
    //       process.env.NODE_ENV !== 'production'
    //         ? { target: 'pino-pretty', options: { singleLine: true } }
    //         : undefined,

    //     redact: {
    //       paths: [
    //         'req.headers.authorization',
    //         'req.body.password',
    //         'req.body.confirmPassword',
    //         'req.body.token',
    //         'req.body.user.password',
    //         'req.body.pin',
    //         'req.body.transactionPin',
    //       ],
    //       censor: '[REDACTED]',
    //     },
    //   },
    // }),
    AuthModule,
    CampaignModule,
    UserModule,
    SettingsModule,
    CommonModule,
    NotificationModule,
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
    }),
    TransactionModule,
    WalletModule,
    PaymentModule,
    AdminModule,
    SplitBillModule,
    UploadModule,
    EventModule,
    DynamicLinkModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
