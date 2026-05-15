import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../user/entities/user.entity';
import { CampaignVendorService } from '../services/campaign-vendor.service';
import { CampaignProposalService } from '../services/campaign-proposal.service';
import {
  CreateVendorDto,
  UpdateVendorDto,
} from '../dto/campaign-vendor.dto';
import {
  CreateProposalDto,
  VoteProposalDto,
} from '../dto/campaign-proposal.dto';

@ApiTags('Campaign - Governance')
@Controller()
export class CampaignGovernanceController {
  constructor(
    private readonly vendorService: CampaignVendorService,
    private readonly proposalService: CampaignProposalService,
  ) {}

  /* ===== VENDORS ===== */

  @Get('campaigns/:id/vendors')
  @ApiOperation({ summary: 'List vendors / beneficiaries for a campaign' })
  listVendors(@Param('id') campaignId: string) {
    return this.vendorService.list(campaignId);
  }

  @Post('campaigns/:id/vendors')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Add a saved vendor / beneficiary (creator only)',
  })
  createVendor(
    @CurrentUser() user: User,
    @Param('id') campaignId: string,
    @Body() dto: CreateVendorDto,
  ) {
    return this.vendorService.create(campaignId, user.id, dto);
  }

  @Patch('campaigns/vendors/:vendorId')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update a vendor (creator only)' })
  updateVendor(
    @CurrentUser() user: User,
    @Param('vendorId') vendorId: string,
    @Body() dto: UpdateVendorDto,
  ) {
    return this.vendorService.update(vendorId, user.id, dto);
  }

  @Delete('campaigns/vendors/:vendorId')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Remove a vendor (creator only)' })
  removeVendor(
    @CurrentUser() user: User,
    @Param('vendorId') vendorId: string,
  ) {
    return this.vendorService.remove(vendorId, user.id);
  }

  /* ===== PROPOSALS ===== */

  @Get('campaigns/:id/proposals')
  @ApiOperation({
    summary:
      'List proposals for a campaign (includes my-vote when authenticated)',
  })
  listProposals(
    @Param('id') campaignId: string,
    @Req() req: Request & { user?: User },
  ) {
    return this.proposalService.listWithMyVote(
      campaignId,
      req.user?.id ?? null,
    );
  }

  @Get('campaigns/proposals/:proposalId')
  @ApiOperation({ summary: 'Get a proposal with allocations and votes' })
  getProposal(@Param('proposalId') proposalId: string) {
    return this.proposalService.get(proposalId);
  }

  @Post('campaigns/:id/proposals')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Submit a disbursement proposal (creator or organizer)',
  })
  createProposal(
    @CurrentUser() user: User,
    @Param('id') campaignId: string,
    @Body() dto: CreateProposalDto,
  ) {
    return this.proposalService.create(campaignId, user.id, dto);
  }

  @Post('campaigns/proposals/:proposalId/vote')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Vote approve / reject on a pending proposal',
  })
  voteProposal(
    @CurrentUser() user: User,
    @Param('proposalId') proposalId: string,
    @Body() dto: VoteProposalDto,
  ) {
    return this.proposalService.vote(proposalId, user.id, dto);
  }

  @Post('campaigns/proposals/:proposalId/cancel')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Cancel a pending proposal (proposer or creator)',
  })
  cancelProposal(
    @CurrentUser() user: User,
    @Param('proposalId') proposalId: string,
  ) {
    return this.proposalService.cancel(proposalId, user.id);
  }

  @Post('campaigns/proposals/:proposalId/execute')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Mark an approved proposal as executed once payout settles (creator only)',
  })
  executeProposal(
    @CurrentUser() user: User,
    @Param('proposalId') proposalId: string,
  ) {
    return this.proposalService.markExecuted(proposalId, user.id);
  }
}
