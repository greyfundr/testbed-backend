import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { TransactionService } from '../services';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { KycGuard } from '../../auth/guards/kyc.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import {
  DonateToCampaignDto,
  PayInvoiceDto,
  PaySplitBillDto,
  InternalTransferDto,
  TransactionQueryDto,
} from '../dto';
import { ApiBearerAuth } from '@nestjs/swagger';

@Controller('transactions')
@UseGuards(JwtAuthGuard, KycGuard)
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @ApiBearerAuth('JWT-auth')
  @Post('donate')
  @HttpCode(HttpStatus.CREATED)
  async donateToCampaign(
    @CurrentUser('id') userId: string,
    @Body() dto: DonateToCampaignDto,
  ) {
    return this.transactionService.donateToCampaign(userId, dto);
  }

  @ApiBearerAuth('JWT-auth')
  @Post('pay-bill')
  @HttpCode(HttpStatus.CREATED)
  async paySplitBill(
    @CurrentUser('id') userId: string,
    @Body() dto: PaySplitBillDto,
  ) {
    return this.transactionService.paySplitBill(userId, dto);
  }

  @ApiBearerAuth('JWT-auth')
  @Post('pay-invoice')
  @HttpCode(HttpStatus.CREATED)
  async payInvoice(
    @CurrentUser('id') userId: string,
    @Body() dto: PayInvoiceDto,
  ) {
    return this.transactionService.payInvoice(userId, dto);
  }

  @ApiBearerAuth('JWT-auth')
  @Post('transfer')
  @HttpCode(HttpStatus.CREATED)
  async internalTransfer(
    @CurrentUser('id') userId: string,
    @Body() dto: InternalTransferDto,
  ) {
    return this.transactionService.internalTransfer(userId, dto);
  }

  @ApiBearerAuth('JWT-auth')
  @Get(':id')
  async getTransaction(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) transactionId: string,
  ) {
    return this.transactionService.getTransactionById(userId, transactionId);
  }

  @Get('')
  async getTransactions(
    @CurrentUser('id') userId: string,
    @Query() query: TransactionQueryDto,
  ) {
    return this.transactionService.getTransactionHistory(userId, query);
  }

  @Get('summary')
  async getTransactionSummary(@CurrentUser('id') userId: string) {
    return this.transactionService.getTransactionSummary(userId);
  }

  @Get(':id/ledger')
  async getTransactionLedger(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) transactionId: string,
  ) {
    return this.transactionService.getTransactionLedger(userId, transactionId);
  }
}
