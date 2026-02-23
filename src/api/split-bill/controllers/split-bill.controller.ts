import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { SplitBillService } from '../services';
import { JwtAuthGuard, KycGuard, SkipKyc } from '../../auth/guards';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import {
  CreateSplitBillDto,
  UpdateSplitBillDto,
  AddParticipantDto,
  RemoveParticipantDto,
  PayBillShareDto,
  GuestPayBillShareDto,
  CancelBillDto,
  GetUserBillsDto,
} from '../dto';
import { ShareAdjustment } from '../interfaces';
import { User } from 'src/api/user/entities';

@Controller('split-bills')
@UseGuards(JwtAuthGuard, KycGuard)
export class SplitBillController {
  constructor(private readonly splitBillService: SplitBillService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createBill(@CurrentUser() user: User, @Body() dto: CreateSplitBillDto) {
    const bill = await this.splitBillService.createBill(user.id, dto);
    return {
      success: true,
      message: 'Split bill created successfully',
      data: bill,
    };
  }

  @Get()
  async getUserBills(
    @CurrentUser() user: User,
    @Query() query: GetUserBillsDto,
  ) {
    const result = await this.splitBillService.getUserBills(user.id, query);
    return {
      success: true,
      message: 'Bills retrieved successfully',
      data: result.bills,
      pagination: {
        page: result.page,
        total: result.total,
        totalPages: result.totalPages,
      },
    };
  }

  @Get(':id')
  async getBill(
    @Param('id', ParseUUIDPipe) billId: string,
    @CurrentUser() user: User,
  ) {
    const bill = await this.splitBillService.getBillById(billId, user.id);
    return {
      success: true,
      message: 'Bill retrieved successfully',
      data: bill,
    };
  }

  @Patch(':id')
  async updateBill(
    @Param('id', ParseUUIDPipe) billId: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateSplitBillDto,
  ) {
    const bill = await this.splitBillService.updateBill(billId, user.id, dto);
    return {
      success: true,
      message: 'Bill updated successfully',
      data: bill,
    };
  }

  @Post(':id/finalize')
  async finalizeBill(
    @Param('id', ParseUUIDPipe) billId: string,
    @CurrentUser() user: User,
  ) {
    const bill = await this.splitBillService.finalizeBill(billId, user.id);
    return {
      success: true,
      message: 'Bill finalized successfully',
      data: bill,
    };
  }

  @Post(':id/cancel')
  async cancelBill(
    @Param('id', ParseUUIDPipe) billId: string,
    @CurrentUser() user: User,
    @Body() dto: CancelBillDto,
  ) {
    const bill = await this.splitBillService.cancelBill(billId, user.id, dto);
    return {
      success: true,
      message: 'Bill cancelled successfully',
      data: bill,
    };
  }

  @Post(':id/reminders')
  async sendReminders(
    @Param('id', ParseUUIDPipe) billId: string,
    @CurrentUser() user: User,
  ) {
    const result = await this.splitBillService.sendReminders(billId, user.id);
    return {
      success: true,
      message: `Reminders sent to ${result.count} participant(s)`,
      data: result,
    };
  }

  @Get(':id/activity')
  async getBillActivity(
    @Param('id', ParseUUIDPipe) billId: string,
    @CurrentUser() user: User,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
  ) {
    const result = await this.splitBillService.getBillActivity(
      billId,
      user.id,
      Number(page),
      Number(limit),
    );
    return {
      success: true,
      message: 'Activity log retrieved successfully',
      data: result.activities,
      pagination: {
        page: result.page,
        total: result.total,
        totalPages: result.totalPages,
      },
    };
  }

  @Post(':id/participants')
  @HttpCode(HttpStatus.CREATED)
  async addParticipant(
    @Param('id', ParseUUIDPipe) billId: string,
    @CurrentUser() user: User,
    @Body() dto: AddParticipantDto,
  ): Promise<{
    success: boolean;
    message: string;
    data: { participant: any; adjustments: ShareAdjustment[] };
  }> {
    const result = await this.splitBillService.addParticipant(
      billId,
      user.id,
      dto,
    );
    return {
      success: true,
      message:
        result.adjustments.length > 0
          ? 'Participant added. Shares recalculated.'
          : 'Participant added successfully.',
      data: {
        participant: result.participant,
        adjustments: result.adjustments,
      },
    };
  }

  @Delete(':id/participants/:participantId')
  async removeParticipant(
    @Param('id', ParseUUIDPipe) billId: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @CurrentUser() user: User,
    @Body() dto: RemoveParticipantDto,
  ): Promise<{
    success: boolean;
    message: string;
    data: { adjustments: ShareAdjustment[] };
  }> {
    const result = await this.splitBillService.removeParticipant(
      billId,
      participantId,
      user.id,
      dto,
    );
    return {
      success: true,
      message:
        result.adjustments.length > 0
          ? 'Participant removed. Shares recalculated.'
          : 'Participant removed successfully.',
      data: { adjustments: result.adjustments },
    };
  }

  @Get('participants/:participantId')
  async getParticipantStatus(
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @CurrentUser() user: User,
  ) {
    const status = await this.splitBillService.getParticipantStatus(
      participantId,
      user.id,
    );
    return {
      success: true,
      message: 'Participant status retrieved successfully',
      data: status,
    };
  }

  @Post('invites/:inviteCode/accept')
  async acceptInvite(
    @Param('inviteCode') inviteCode: string,
    @CurrentUser() user: User,
  ) {
    const participant = await this.splitBillService.acceptInvite(
      inviteCode,
      user.id,
    );
    return {
      success: true,
      message: 'Invite accepted successfully',
      data: participant,
    };
  }

  @Post('invites/:inviteCode/decline')
  @HttpCode(HttpStatus.OK)
  async declineInvite(
    @Param('inviteCode') inviteCode: string,
    @CurrentUser() user: User,
  ) {
    await this.splitBillService.declineInvite(inviteCode, user.id);
    return { success: true, message: 'Invite declined' };
  }

  @Post(':id/participants/:participantId/pay')
  async payBillShare(
    @Param('id', ParseUUIDPipe) billId: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @CurrentUser() user: User,
    @Body() dto: PayBillShareDto,
  ) {
    const result = await this.splitBillService.payBillShare(
      billId,
      participantId,
      user.id,
      dto,
    );
    return {
      success: true,
      message: result.billFullyFunded
        ? 'Payment received — bill is now fully funded!'
        : result.participantFullyPaid
          ? 'Your share is fully paid.'
          : 'Partial payment recorded.',
      data: result,
    };
  }

  @Post(':id/participants/:participantId/payment-link')
  @SkipKyc()
  async getGuestPaymentLink(
    @Param('id', ParseUUIDPipe) billId: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
  ) {
    const paymentUrl = await this.splitBillService.generateGuestPaymentLink(
      billId,
      participantId,
    );

    return {
      success: true,
      message: 'Payment link generated successfully',
      data: { paymentUrl },
    };
  }

  @Post(':id/participants/:participantId/pay-guest')
  @SkipKyc()
  async guestPayBillShare(
    @Param('id', ParseUUIDPipe) billId: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @Body() dto: GuestPayBillShareDto,
  ) {
    const result = await this.splitBillService.guestPayBillShare(
      billId,
      participantId,
      dto,
    );
    return {
      success: true,
      message: result.billFullyFunded
        ? 'Payment received — bill is now fully funded!'
        : result.participantFullyPaid
          ? 'Your share is fully paid.'
          : 'Partial payment recorded.',
      data: result,
    };
  }
}
