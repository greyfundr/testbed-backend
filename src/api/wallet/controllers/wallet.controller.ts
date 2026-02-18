import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { WalletService } from '../services';
import { TransactionService } from '../../transaction/services';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AddBankAccountDto, WithdrawDto } from '../dto';
import { TransactionQueryDto } from '../../transaction/dto';
import { User } from 'src/api/user/entities';
import { ApiBearerAuth } from '@nestjs/swagger';

@Controller('wallet')
@UseGuards(JwtAuthGuard) // all wallet routes require authentication
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly transactionService: TransactionService,
  ) {}

  // ─── Wallet Overview ─────────────────────────────────────────────────────────

  @ApiBearerAuth('JWT-auth')
  @Get()
  async getWallet(@CurrentUser() user: User) {
      console.log("user", user)
    const [wallet, balance] = await Promise.all([
      this.walletService.getWalletByUserId(user.id),
      this.walletService.getWalletBalance(user.id),
    ]);
    console.log('wallet and balance', wallet, balance);
    return {
      id: wallet.id,
      status: wallet.status,
      currency: wallet.currency,
      balance,
      virtualAccount: wallet.virtualAccount
        ? {
            accountNumber: wallet.virtualAccount.accountNumber,
            accountName: wallet.virtualAccount.accountName,
            bankName: wallet.virtualAccount.bankName,
            isAssigned: wallet.virtualAccount.isAssigned,
          }
        : null,
    };
  }

  @ApiBearerAuth('JWT-auth')
  @Get('balance')
  async getBalance(@CurrentUser() user: User) {
    return this.walletService.getWalletBalance(user.id);
  }

  /**
   * Provisions DVA — called after user completes KYC.
   * Idempotent: safe to call multiple times.
   */
  @ApiBearerAuth('JWT-auth')
  @Post('provision-virtual-account')
  //   @UseGuards(KycGuard) // only KYC-verified users can provision
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async provisionVirtualAccount(@CurrentUser() user: User) {
    const va = await this.walletService.provisionVirtualAccount(user.id);
    return {
      accountNumber: va.accountNumber,
      accountName: va.accountName,
      bankName: va.bankName,
      isAssigned: va.isAssigned,
    };
  }

  // ─── Bank Accounts ───────────────────────────────────────────────────────────

  @ApiBearerAuth('JWT-auth')
  @Get('bank-accounts')
  async getBankAccounts(@CurrentUser() user: User) {
    return this.walletService.getUserBankAccounts(user.id);
  }

  @ApiBearerAuth('JWT-auth')
  @Post('bank-accounts')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async addBankAccount(
    @CurrentUser() user: User,
    @Body() dto: AddBankAccountDto,
  ) {
    return this.walletService.addBankAccount(user.id, dto);
  }

  @ApiBearerAuth('JWT-auth')
  @Delete('bank-accounts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeBankAccount(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) bankAccountId: string,
  ) {
    await this.walletService.removeBankAccount(user.id, bankAccountId);
  }

  // ─── Withdrawals ─────────────────────────────────────────────────────────────

  @ApiBearerAuth('JWT-auth')
  @Post('withdraw')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.ACCEPTED) // 202 — transfer is async, confirmed via webhook
  async withdraw(@CurrentUser() user: User, @Body() dto: WithdrawDto) {
    return this.walletService.requestWithdrawal(user.id, dto);
  }

  // ─── Transaction History ──────────────────────────────────────────────────────

  //   @Get('transactions')
  //   async getTransactions(
  //     @CurrentUser('id') userId: string,
  //     @Query() query: TransactionQueryDto,
  //   ) {
  //     return this.transactionService.getTransactionHistory(userId, query);
  //   }

  //   @Get('transactions/summary')
  //   async getTransactionSummary(@CurrentUser('id') userId: string) {
  //     return this.transactionService.getTransactionSummary(userId);
  //   }

  //   @Get('transactions/:id')
  //   async getTransaction(
  //     @CurrentUser('id') userId: string,
  //     @Param('id', ParseUUIDPipe) transactionId: string,
  //   ) {
  //     return this.transactionService.getTransactionById(userId, transactionId);
  //   }

  //   @Get('transactions/:id/ledger')
  //   async getTransactionLedger(
  //     @CurrentUser('id') userId: string,
  //     @Param('id', ParseUUIDPipe) transactionId: string,
  //   ) {
  //     return this.transactionService.getTransactionLedger(userId, transactionId);
  //   }
}
