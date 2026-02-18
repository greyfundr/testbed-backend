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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
    AuthModule,
    CampaignModule,
    UserModule,
    SettingsModule,
    CommonModule,
    NotificationModule,
    EventEmitterModule.forRoot(),
    TransactionModule,
    WalletModule,
    PaymentModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
