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
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { User } from '../../user/entities';

@Controller('transactions')
@UseGuards(JwtAuthGuard, KycGuard)
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Donate to a campaign' })
  @Post('donate')
  @HttpCode(HttpStatus.CREATED)
  async donateToCampaign(
    @CurrentUser() user: User,
    @Body() dto: DonateToCampaignDto,
  ) {
    return this.transactionService.donateToCampaign(user.id, dto);
  }

  @ApiOperation({ summary: 'Make split bill payment' })
  @ApiBearerAuth('JWT-auth')
  @Post('pay-bill')
  @HttpCode(HttpStatus.CREATED)
  async paySplitBill(@CurrentUser() user: User, @Body() dto: PaySplitBillDto) {
    return this.transactionService.paySplitBill(user.id, dto);
  }

  @ApiOperation({ summary: 'Make invoice payment' })
  @ApiBearerAuth('JWT-auth')
  @Post('pay-invoice')
  @HttpCode(HttpStatus.CREATED)
  async payInvoice(@CurrentUser() user: User, @Body() dto: PayInvoiceDto) {
    return this.transactionService.payInvoice(user.id, dto);
  }

  @ApiOperation({ summary: 'Transfer fund to another user' })
  @ApiBearerAuth('JWT-auth')
  @Post('transfer')
  @HttpCode(HttpStatus.CREATED)
  async internalTransfer(
    @CurrentUser() user: User,
    @Body() dto: InternalTransferDto,
  ) {
    return this.transactionService.internalTransfer(user.id, dto);
  }

  @ApiOperation({ summary: 'Get a single transaction by ID' })
  @ApiBearerAuth('JWT-auth')
  @Get(':id')
  async getTransaction(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) transactionId: string,
  ) {
    return this.transactionService.getTransactionById(user.id, transactionId);
  }

  @ApiOperation({ summary: 'Get user transaction history' })
  @Get('')
  async getTransactions(
    @CurrentUser() user: User,
    @Query() query: TransactionQueryDto,
  ) {
    return this.transactionService.getTransactionHistory(user.id, query);
  }

  @ApiOperation({ summary: 'Get user transaction summary' })
  @Get('summary/user')
  async getTransactionSummary(@CurrentUser() user: User) {
    return this.transactionService.getTransactionSummary(user.id);
  }

  @ApiOperation({ summary: 'Get user transaction ;edger' })
  @Get(':id/ledger')
  async getTransactionLedger(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) transactionId: string,
  ) {
    return this.transactionService.getTransactionLedger(user.id, transactionId);
  }
}
