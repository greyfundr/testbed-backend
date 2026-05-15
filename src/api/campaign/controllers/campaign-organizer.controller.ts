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
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../user/entities/user.entity';
import { CampaignOrganizerService } from '../services/campaign-organizer.service';
import {
  CreateOrganizerDto,
  RejectOrganizerInvitationDto,
  UpdateOrganizerDto,
} from '../dto/campaign-extras.dto';

@ApiTags('Campaign - Organizers')
@Controller('campaigns')
export class CampaignOrganizerController {
  constructor(private readonly organizerService: CampaignOrganizerService) {}

  @Get(':id/organizers')
  @ApiOperation({ summary: 'List organizers for a campaign' })
  list(@Param('id') campaignId: string, @Req() req: { user?: User }) {
    return this.organizerService.list(campaignId, req.user?.id);
  }

  @Post(':id/organizers')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Add an organizer to a campaign (creator only)' })
  create(
    @CurrentUser() user: User,
    @Param('id') campaignId: string,
    @Body() dto: CreateOrganizerDto,
  ) {
    return this.organizerService.create(campaignId, user.id, dto);
  }

  @Patch('organizers/:organizerId')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update an organizer (creator only)' })
  update(
    @CurrentUser() user: User,
    @Param('organizerId') organizerId: string,
    @Body() dto: UpdateOrganizerDto,
  ) {
    return this.organizerService.update(organizerId, user.id, dto);
  }

  @Delete('organizers/:organizerId')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Remove an organizer (creator only)' })
  remove(
    @CurrentUser() user: User,
    @Param('organizerId') organizerId: string,
  ) {
    return this.organizerService.remove(organizerId, user.id);
  }

  @Post('organizers/:organizerId/accept')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Accept an organizer invitation (invitee only)' })
  accept(
    @CurrentUser() user: User,
    @Param('organizerId') organizerId: string,
  ) {
    return this.organizerService.accept(organizerId, user.id);
  }

  @Post('organizers/:organizerId/reject')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Decline an organizer invitation (invitee only) — optional rejection reason',
  })
  reject(
    @CurrentUser() user: User,
    @Param('organizerId') organizerId: string,
    @Body() dto: RejectOrganizerInvitationDto,
  ) {
    return this.organizerService.reject(organizerId, user.id, dto.reason);
  }

  @Get('me/organizer-invitations')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'List pending organizer invitations addressed to the current user',
  })
  myInvitations(@CurrentUser() user: User) {
    return this.organizerService.listInvitations(user.id);
  }

  @Post('organizers/:organizerId/follow')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Follow an organizer' })
  follow(
    @CurrentUser() user: User,
    @Param('organizerId') organizerId: string,
  ) {
    return this.organizerService.follow(organizerId, user.id);
  }

  @Delete('organizers/:organizerId/follow')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Unfollow an organizer' })
  unfollow(
    @CurrentUser() user: User,
    @Param('organizerId') organizerId: string,
  ) {
    return this.organizerService.unfollow(organizerId, user.id);
  }
}
