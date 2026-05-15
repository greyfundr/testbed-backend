import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CampaignService, DonationService } from '../services';
import { Campaign, Donation } from '../entities';

import {
  CreateCampaignDto,
  UpdateCampaignDto,
  UpdateCampaignStatusDto,
  DonateDto,
  CampaignFilterDto,
} from '../dto/campaign.dto';
import {
  CampaignCategoryResponseDto,
  CampaignResponseDto,
} from '../dto/campaign-response.dto';
import { DonationResponseDto } from '../dto/donation-response.dto';
import {
  PaginationDto,
  PaginatedResponse,
} from '../../../common/helpers/pagination.helper';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { User } from '../../user/entities';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Campaigns')
@Controller('campaigns')
export class CampaignController {
  constructor(
    private readonly campaignService: CampaignService,
    private readonly donationService: DonationService,
  ) {}

  @ApiOperation({ summary: 'Get all campaign categories' })
  @ApiResponse({
    status: 200,
    description: 'Return all campaign categories.',
    type: CampaignCategoryResponseDto,
  })
  @Get('categories')
  async getCategories(): Promise<any[]> {
    return this.campaignService.getCampaignCategories();
  }

  @ApiOperation({ summary: 'Create a new campaign' })
  @ApiResponse({
    status: 201,
    description: 'The campaign has been successfully created.',
    type: Campaign,
  })
  @ApiBearerAuth('JWT-auth')
  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createCampaignDto: CreateCampaignDto,
    @CurrentUser() user: User,
  ) {
    const campaign = await this.campaignService.create(createCampaignDto, user);
    return this.campaignService.mapToResponse(campaign, user.id);
  }

  @ApiOperation({ summary: 'Get all campaigns' })
  @ApiResponse({
    status: 200,
    description: 'Return all campaigns.',
    type: CampaignResponseDto,
  })
  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(
    @Query() filterDto: CampaignFilterDto,
    @CurrentUser() user?: User,
  ): Promise<PaginatedResponse<CampaignResponseDto>> {
    return this.campaignService.findAll(filterDto, user?.id);
  }

  @ApiOperation({ summary: 'Get campaigns created by the current user' })
  @ApiResponse({
    status: 200,
    description: 'Return user campaigns.',
    type: [CampaignResponseDto],
  })
  @ApiBearerAuth('JWT-auth')
  @Get('my-campaigns')
  @UseGuards(JwtAuthGuard)
  async findMyCampaigns(
    @CurrentUser() user: User,
  ): Promise<CampaignResponseDto[]> {
    return this.campaignService.findMyCampaigns(user);
  }

  @ApiOperation({ summary: 'Get a campaign by ID' })
  @ApiResponse({
    status: 200,
    description: 'Return the campaign.',
    type: CampaignResponseDto,
  })
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user?: User,
  ): Promise<CampaignResponseDto> {
    const campaign = await this.campaignService.findOne(id);
    return this.campaignService.mapToResponse(campaign, user?.id);
  }

  @ApiOperation({ summary: 'Update a campaign' })
  @ApiResponse({
    status: 200,
    description: 'The campaign has been updated.',
    type: Campaign,
  })
  @ApiBearerAuth('JWT-auth')
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateCampaignDto: UpdateCampaignDto,
    @CurrentUser() user: User,
  ) {
    return this.campaignService.update(id, updateCampaignDto, user);
  }

  @ApiOperation({
    summary:
      "Update a campaign's status (creator only) — pause, resume, or cancel",
  })
  @ApiBearerAuth('JWT-auth')
  @Patch(':id/status')
  @UseGuards(JwtAuthGuard)
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateCampaignStatusDto,
    @CurrentUser() user: User,
  ) {
    return this.campaignService.updateStatus(id, dto.status, user);
  }

  @ApiOperation({ summary: 'Donate to a campaign' })
  @ApiResponse({
    status: 201,
    description: 'The donation was successful.',
    type: Donation,
  })
  @ApiBearerAuth('JWT-auth')
  @Post(':id/donate')
  @UseGuards(JwtAuthGuard)
  async donate(
    @Param('id') id: string,
    @Body() donateDto: DonateDto,
    @CurrentUser() user: User,
  ) {
    return this.donationService.donate(id, donateDto, user);
  }

  @ApiOperation({ summary: 'Get all donations for a campaign' })
  @ApiResponse({
    status: 200,
    description: 'Return campaign donations.',
    type: DonationResponseDto,
  })
  @Get(':id/donations')
  async getDonations(
    @Param('id') id: string,
    @Query() paginationDto: PaginationDto,
  ): Promise<PaginatedResponse<DonationResponseDto>> {
    return this.donationService.getCampaignDonations(id, paginationDto);
  }

  @ApiOperation({ summary: 'Get top donors for a campaign' })
  @ApiResponse({
    status: 200,
    description: 'Return top donors for the campaign.',
    type: DonationResponseDto,
  })
  @Get(':id/top-donors')
  async getTopDonors(
    @Param('id') id: string,
    @Query('limit') limit: number,
  ): Promise<DonationResponseDto[]> {
    return this.donationService.getTopDonors(id, limit);
  }
}
