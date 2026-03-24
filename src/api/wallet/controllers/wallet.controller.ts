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
import { AddBankAccountDto, InitiateFundingDto, WithdrawDto } from '../dto';
import { User } from '../../user/entities';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { KycGuard } from '../../auth/guards/kyc.guard';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly transactionService: TransactionService,
  ) {}

  @ApiOperation({ summary: 'Get user wallet' })
  @ApiBearerAuth('JWT-auth')
  @Get()
  async getWallet(@CurrentUser() user: User) {
    const [wallet, balance] = await Promise.all([
      this.walletService.getWalletByUserId(user.id),
      this.walletService.getWalletBalance(user.id),
    ]);
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

  @ApiOperation({ summary: 'Get user wallet balance' })
  @ApiBearerAuth('JWT-auth')
  @Get('balance')
  async getBalance(@CurrentUser() user: User) {
    return this.walletService.getWalletBalance(user.id);
  }

  @ApiOperation({ summary: 'Provision a virtual account for the user' })
  @ApiBearerAuth('JWT-auth')
  @Post('provision-virtual-account')
  @UseGuards(JwtAuthGuard, KycGuard)
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

  @ApiOperation({ summary: 'Get user funding account details' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard, KycGuard)
  @Get('funding-account')
  @HttpCode(HttpStatus.OK)
  async getFundingAccount(@CurrentUser() user: User) {
    const account = await this.walletService.getFundingAccount(user.id);

    if (!account.accountNumber) {
      return {
        message:
          'Virtual account not yet provisioned. Complete KYC verification first, then call POST /wallet/provision-virtual-account.',
        provisioningPending: false,
        account: null,
      };
    }

    if (account.provisioningPending) {
      return {
        message:
          'Your virtual account is being set up. This usually takes under 60 seconds. Please try again shortly.',
        provisioningPending: true,
        account: {
          bankName: account.bankName,
          accountName: account.accountName,
        },
      };
    }

    return {
      message:
        'Transfer to this account from any Nigerian bank to fund your wallet.',
      provisioningPending: false,
      account: {
        accountNumber: account.accountNumber,
        accountName: account.accountName,
        bankName: account.bankName,
      },
    };
  }

  @ApiOperation({ summary: 'Initiate wallet funding via card, transfer' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard, KycGuard)
  @Post('fund/initiate')
  @HttpCode(HttpStatus.CREATED)
  async initiateCardFunding(
    @CurrentUser() user: User,
    @Body() dto: InitiateFundingDto,
  ) {
    const result = await this.walletService.initiateWalletFunding(
      user.id,
      dto.amount,
    );

    return {
      message: 'Payment initialized. Redirect user to authorizationUrl.',
      ...result,
    };
  }

  @ApiOperation({ summary: 'Verify funding transaction and credit wallet' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard, KycGuard)
  @Get('fund/verify/:reference')
  @HttpCode(HttpStatus.OK)
  async verifyFunding(
    @CurrentUser() user: User,
    @Param('reference') reference: string,
  ) {
    const result = await this.walletService.verifyAndCreditFunding(
      user.id,
      reference,
    );

    const messages = {
      success: result.credited
        ? `₦${result.amount / 100} has been added to your wallet.`
        : `Payment already confirmed. ₦${result.amount / 100} is in your wallet.`,
      failed: 'Payment was not completed. No funds have been deducted.',
      pending: 'Payment is still being processed. Please check back shortly.',
    };

    return {
      status: result.status,
      message: messages[result.status] ?? 'Unknown status',
      amount: result.amount,
      amountFormatted: `₦${(result.amount / 100).toLocaleString('en-NG')}`,
    };
  }

  @ApiOperation({ summary: 'Get user bank accounts linked to wallet' })
  @ApiBearerAuth('JWT-auth')
  @Get('bank-accounts')
  async getBankAccounts(@CurrentUser() user: User) {
    return this.walletService.getUserBankAccounts(user.id);
  }

  @ApiOperation({ summary: 'Add a bank account to the user wallet' })
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

  @ApiOperation({ summary: 'Remove a bank account from the user wallet' })
  @ApiBearerAuth('JWT-auth')
  @Delete('bank-accounts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeBankAccount(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) bankAccountId: string,
  ) {
    await this.walletService.removeBankAccount(user.id, bankAccountId);
  }

  @ApiOperation({ summary: 'Request for withdrawal from user wallet' })
  @ApiBearerAuth('JWT-auth')
  @Post('withdraw')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.ACCEPTED) // 202 — transfer is async, confirmed via webhook
  async withdraw(@CurrentUser() user: User, @Body() dto: WithdrawDto) {
    return this.walletService.requestWithdrawal(user.id, dto);
  }
}
