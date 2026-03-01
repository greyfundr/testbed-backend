import { Module } from '@nestjs/common';
import { SplitBillController } from './controllers/split-bill.controller';
import { SplitBillService } from './services/split-bill.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SplitBill, SplitBillActivity, SplitBillParticipant } from './entities';
import { UserModule } from '../user/user.module';
import { WalletModule } from '../wallet/wallet.module';
import { TransactionModule } from '../transaction/transaction.module';
import { PaymentService } from '../payment/services';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SplitBill,
      SplitBillParticipant,
      SplitBillActivity,
    ]),
    UserModule,
    WalletModule,
    TransactionModule,
  ],
  controllers: [SplitBillController],
  providers: [SplitBillService, PaymentService],
  exports: [SplitBillService],
})
export class SplitBillModule {}
