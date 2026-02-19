import { forwardRef, Module } from '@nestjs/common';
import { WalletController } from './controllers/wallet.controller';
import { WalletService } from './services/wallet.service';
import {
  Wallet,
  VirtualAccount,
  BankAccount,
  WithdrawalRequest,
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
    ]),
    forwardRef(() => PaymentModule),
    UserModule,
    forwardRef(() => TransactionModule),
  ],
  controllers: [WalletController],
  providers: [
    WalletService,
    WalletRepository,
    BankAccountRepository,
    WithdrawalRequestRepository,
    VirtualAccountRepository,
  ],
  exports: [
    WalletService,
    WalletRepository,
    BankAccountRepository,
    WithdrawalRequestRepository,
    VirtualAccountRepository,
  ],
})
export class WalletModule {}
