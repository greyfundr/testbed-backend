import {
  Controller,
  Get,
  Patch,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { AdminCampaignService } from '../services/admin-campaign.service';
import { AdminJwtAuthGuard } from '../guards/admin.guard';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { CampaignStatus } from '../../campaign/enums/campaign.enum';

@ApiTags('Admin - Campaigns')
@Controller('admin/campaigns')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard)
export class AdminCampaignController {
  constructor(private readonly adminCampaignService: AdminCampaignService) {}

  @ApiOperation({ summary: 'Get all campaigns' })
  @ApiQuery({ name: 'status', enum: CampaignStatus, required: false })
  @Get()
  async getCampaigns(@Query('status') status?: CampaignStatus) {
    const campaigns = await this.adminCampaignService.getCampaigns(status);
    return {
      success: true,
      message: 'Campaigns fetched successfully',
      data: campaigns,
    };
  }

  @ApiOperation({ summary: 'Approve a campaign to go live' })
  @Patch(':id/approve')
  async approveCampaign(@Param('id') campaignId: string) {
    const campaign =
      await this.adminCampaignService.approveCampaign(campaignId);
    return {
      success: true,
      message: 'Campaign approved successfully',
      data: campaign,
    };
  }
}
