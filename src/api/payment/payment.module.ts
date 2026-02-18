import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction, WebhookLog } from '../transaction/entities';
import { WithdrawalRequest, VirtualAccount } from '../wallet/entities';
import { PaymentService } from './services';
import { PaymentWebhookService } from './services/payment-webhook.service';
import { PaymentWebhookController } from './controllers/payment-webhook.controller';
import { WalletModule } from '../wallet/wallet.module';
import { TransactionModule } from '../transaction/transaction.module';

@Module({
  imports: [
    forwardRef(() => WalletModule),
    TransactionModule,
    // TypeOrmModule.forFeature([
    //   WebhookLog,
    //   Transaction,
    //   WithdrawalRequest,
    //   VirtualAccount,
    // ]),
  ],
  controllers: [PaymentWebhookController],
  providers: [PaymentService, PaymentWebhookService],
  exports: [PaymentService, PaymentWebhookService],
})
export class PaymentModule {}
