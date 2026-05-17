import { forwardRef, Module } from '@nestjs/common';
import { WalletController } from './controllers/wallet.controller';
import { WalletService } from './services/wallet.service';
import { PendingPayoutService } from './services/pending-payout.service';
import {
  Wallet,
  VirtualAccount,
  BankAccount,
  WithdrawalRequest,
  PendingPayout,
} from './entities';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  BankAccountRepository,
  VirtualAccountRepository,
  WalletRepository,
  WithdrawalRequestRepository,
} from './repository';
import { PaymentModule } from '../payment/payment.module';
import { UserModule } from '../user/user.module';
import { TransactionModule } from '../transaction/transaction.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Wallet,
      VirtualAccount,
      BankAccount,
      WithdrawalRequest,
      PendingPayout,
    ]),
    forwardRef(() => PaymentModule),
    forwardRef(() => UserModule),
    forwardRef(() => TransactionModule),
  ],
  controllers: [WalletController],
  providers: [
    WalletService,
    PendingPayoutService,
    WalletRepository,
    BankAccountRepository,
    WithdrawalRequestRepository,
    VirtualAccountRepository,
  ],
  exports: [
    WalletService,
    PendingPayoutService,
    WalletRepository,
    BankAccountRepository,
    WithdrawalRequestRepository,
    VirtualAccountRepository,
  ],
})
export class WalletModule {}
