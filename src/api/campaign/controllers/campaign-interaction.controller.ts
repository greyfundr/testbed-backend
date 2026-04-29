import { Controller, Post, Delete, Get, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../user/entities/user.entity';
import { CampaignInteractionService } from '../services/campaign-interaction.service';
import { CreateCommentDto } from '../dto/campaign-interaction.dto';

@ApiTags('Campaign - Interactions')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('campaigns/:id')
export class CampaignInteractionController {
  constructor(private readonly interactionService: CampaignInteractionService) {}

  @Post('like')
  @ApiOperation({ summary: 'Like a campaign' })
  likeCampaign(@CurrentUser() user: User, @Param('id') campaignId: string) {
    return this.interactionService.likeCampaign(user.id, campaignId);
  }

  @Delete('like')
  @ApiOperation({ summary: 'Unlike a campaign' })
  unlikeCampaign(@CurrentUser() user: User, @Param('id') campaignId: string) {
    return this.interactionService.unlikeCampaign(user.id, campaignId);
  }

  @Post('comments')
  @ApiOperation({ summary: 'Add a comment to a campaign' })
  addComment(
    @CurrentUser() user: User,
    @Param('id') campaignId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.interactionService.addComment(user.id, campaignId, dto);
  }

  @Get('comments')
  @ApiOperation({ summary: 'Get all comments for a campaign' })
  getComments(@Param('id') campaignId: string) {
    return this.interactionService.getComments(campaignId);
  }
}
