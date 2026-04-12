import { forwardRef, Module } from '@nestjs/common';
import { PaymentService } from './services';
import { PaymentWebhookService } from './services/payment-webhook.service';
import { PaymentWebhookController } from './controllers/payment-webhook.controller';
import { WalletModule } from '../wallet/wallet.module';
import { TransactionModule } from '../transaction/transaction.module';
import { EventModule } from '../event/event.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    forwardRef(() => WalletModule),
    TransactionModule,
    forwardRef(() => EventModule),
    UserModule,
  ],
  controllers: [PaymentWebhookController],
  providers: [PaymentService, PaymentWebhookService],
  exports: [PaymentService, PaymentWebhookService],
})
export class PaymentModule {}
