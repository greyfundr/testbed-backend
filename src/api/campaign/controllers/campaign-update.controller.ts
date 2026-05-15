import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../user/entities/user.entity';
import { CampaignUpdateService } from '../services';
import { CreateCampaignUpdateDto } from '../dto/campaign-update.dto';

@ApiTags('Campaign - Updates')
@Controller('campaigns')
export class CampaignUpdateController {
  constructor(private readonly updateService: CampaignUpdateService) {}

  @Get(':id/updates')
  @ApiOperation({ summary: 'List organiser broadcasts for a campaign' })
  list(@Param('id') campaignId: string) {
    return this.updateService.list(campaignId);
  }

  @Post(':id/updates')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Post an organiser update (creator or organiser only)',
  })
  create(
    @CurrentUser() user: User,
    @Param('id') campaignId: string,
    @Body() dto: CreateCampaignUpdateDto,
  ) {
    return this.updateService.create(campaignId, user, dto);
  }
}
