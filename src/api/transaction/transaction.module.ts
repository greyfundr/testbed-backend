import { Module } from '@nestjs/common';
import { TransactionController } from './controllers/transaction.controller';
import { TransactionService } from './services/transaction.service';
import { LedgerEntry, Transaction, WebhookLog } from './entities';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  LedgerEntryRepository,
  TransactionRepository,
  WebhookLogRepository,
} from './repository';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction, LedgerEntry, WebhookLog])],
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
