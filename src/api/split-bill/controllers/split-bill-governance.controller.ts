import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../user/entities';
import { SplitBillGovernanceService } from '../services/split-bill-governance.service';
import {
  CastSplitBillProposalVoteDto,
  CreateSplitBillProposalDto,
  CreateSplitBillVendorDto,
} from '../dtos/split-bill-governance.dto';

@ApiTags('split-bills · governance')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('split-bills')
export class SplitBillGovernanceController {
  constructor(
    private readonly governance: SplitBillGovernanceService,
  ) {}

  // ─── Vendors ───────────────────────────────────────────────
  @Get(':id/vendors')
  @ApiOperation({ summary: 'List vendors attached to a split bill' })
  listVendors(
    @Param('id', ParseUUIDPipe) billId: string,
    @CurrentUser() user: User,
  ) {
    return this.governance.listVendors(billId, user.id);
  }

  @Post(':id/vendors')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Attach a new vendor/beneficiary to a bill' })
  createVendor(
    @Param('id', ParseUUIDPipe) billId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateSplitBillVendorDto,
  ) {
    return this.governance.createVendor(billId, user.id, dto);
  }

  @Delete(':id/vendors/:vendorId')
  @ApiOperation({ summary: 'Remove a vendor (creator only)' })
  deleteVendor(
    @Param('id', ParseUUIDPipe) billId: string,
    @Param('vendorId', ParseUUIDPipe) vendorId: string,
    @CurrentUser() user: User,
  ) {
    return this.governance.deleteVendor(billId, user.id, vendorId);
  }

  // ─── Proposals ─────────────────────────────────────────────
  @Get(':id/proposals')
  @ApiOperation({ summary: 'List proposals on a split bill' })
  listProposals(
    @Param('id', ParseUUIDPipe) billId: string,
    @CurrentUser() user: User,
  ) {
    return this.governance.listProposals(billId, user.id);
  }

  @Post(':id/proposals')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Propose a disbursement (creator or participant)',
  })
  createProposal(
    @Param('id', ParseUUIDPipe) billId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateSplitBillProposalDto,
  ) {
    return this.governance.createProposal(billId, user.id, dto);
  }

  @Post(':id/proposals/:proposalId/vote')
  @ApiOperation({
    summary: 'Cast or change your vote on a pending proposal',
  })
  castVote(
    @Param('id', ParseUUIDPipe) billId: string,
    @Param('proposalId', ParseUUIDPipe) proposalId: string,
    @CurrentUser() user: User,
    @Body() dto: CastSplitBillProposalVoteDto,
  ) {
    return this.governance.castVote(billId, proposalId, user.id, dto);
  }
}
