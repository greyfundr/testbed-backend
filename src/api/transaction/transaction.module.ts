import { forwardRef, Module } from '@nestjs/common';
import { TransactionController } from './controllers/transaction.controller';
import { TransactionService } from './services/transaction.service';
import { LedgerEntry, Transaction, WebhookLog } from './entities';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  LedgerEntryRepository,
  TransactionRepository,
  WebhookLogRepository,
} from './repository';
import { WalletModule } from '../wallet/wallet.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, LedgerEntry, WebhookLog]),
    forwardRef(() => WalletModule),
    forwardRef(() => UserModule),
  ],
  controllers: [TransactionController],
  providers: [
    TransactionService,
    TransactionRepository,
    LedgerEntryRepository,
    WebhookLogRepository,
  ],
  exports: [
    TransactionService,
    TransactionRepository,
    LedgerEntryRepository,
    WebhookLogRepository,
  ],
})
export class TransactionModule {}
