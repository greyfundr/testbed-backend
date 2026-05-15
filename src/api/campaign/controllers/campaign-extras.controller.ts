import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../user/entities/user.entity';
import { CampaignSaveService } from '../services/campaign-save.service';
import { CampaignAmplifierService } from '../services/campaign-amplifier.service';
import { CampaignExpenditureService } from '../services/campaign-expenditure.service';
import {
  CreateExpenditureDto,
  UpdateExpenditureDto,
} from '../dto/campaign-extras.dto';

@ApiTags('Campaign - Extras')
@Controller()
export class CampaignExtrasController {
  constructor(
    private readonly saveService: CampaignSaveService,
    private readonly amplifierService: CampaignAmplifierService,
    private readonly expenditureService: CampaignExpenditureService,
  ) {}

  /* ===== SAVES ===== */

  @Post('campaigns/:id/save')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Save (bookmark) a campaign' })
  save(@CurrentUser() user: User, @Param('id') campaignId: string) {
    return this.saveService.save(user.id, campaignId);
  }

  @Delete('campaigns/:id/save')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Remove a saved campaign' })
  unsave(@CurrentUser() user: User, @Param('id') campaignId: string) {
    return this.saveService.unsave(user.id, campaignId);
  }

  @Get('me/saved-campaigns')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "List the current user's saved campaigns" })
  mySaves(@CurrentUser() user: User) {
    return this.saveService.getUserSaves(user.id);
  }

  /* ===== AMPLIFIERS ===== */

  @Post('campaigns/:id/amplify')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Become an amplifier for a campaign (generates referral code + share URL)',
  })
  becomeAmplifier(
    @CurrentUser() user: User,
    @Param('id') campaignId: string,
  ) {
    return this.amplifierService.claim(campaignId, user.id);
  }

  @Get('campaigns/:id/amplifiers')
  @ApiOperation({ summary: 'List amplifiers for a campaign' })
  listAmplifiers(@Param('id') campaignId: string) {
    return this.amplifierService.listForCampaign(campaignId);
  }

  @Get('campaigns/:id/top-amplifiers')
  @ApiOperation({ summary: 'Top amplifiers by influenced amount' })
  topAmplifiers(
    @Param('id') campaignId: string,
    @Query('limit') limit?: string,
  ) {
    return this.amplifierService.topForCampaign(
      campaignId,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Get('campaigns/amplifiers/by-code/:code')
  @ApiOperation({
    summary:
      'Resolve a referral code to its amplifier (used by share-link landing)',
  })
  byCode(@Param('code') code: string) {
    return this.amplifierService.getByCode(code);
  }

  /* ===== EXPENDITURES ===== */

  @Get('campaigns/:id/expenditures')
  @ApiOperation({ summary: 'List expenditures for a campaign' })
  listExpenditures(@Param('id') campaignId: string) {
    return this.expenditureService.list(campaignId);
  }

  @Post('campaigns/:id/expenditures')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Post an expenditure (creator only)' })
  createExpenditure(
    @CurrentUser() user: User,
    @Param('id') campaignId: string,
    @Body() dto: CreateExpenditureDto,
  ) {
    return this.expenditureService.create(campaignId, user.id, dto);
  }

  @Patch('campaigns/expenditures/:expId')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update an expenditure (creator only)' })
  updateExpenditure(
    @CurrentUser() user: User,
    @Param('expId') expId: string,
    @Body() dto: UpdateExpenditureDto,
  ) {
    return this.expenditureService.update(expId, user.id, dto);
  }

  @Delete('campaigns/expenditures/:expId')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Remove an expenditure (creator only)' })
  removeExpenditure(
    @CurrentUser() user: User,
    @Param('expId') expId: string,
  ) {
    return this.expenditureService.remove(expId, user.id);
  }
}
