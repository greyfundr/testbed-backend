import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../user/entities/user.entity';
import { SplitBillOrganizerService } from '../services/split-bill-organizer.service';
import {
  CreateSplitBillOrganizerDto,
  RejectSplitBillOrganizerInvitationDto,
  UpdateSplitBillOrganizerDto,
} from '../dto/split-bill-organizer.dto';

// Mirrors the campaign-organizers controller. Routes are nested under
// `split-bills` so the URL surface stays consistent with the rest of
// the bill domain (`/split-bills/:id/...`).
@ApiTags('Split bill - Organizers')
@Controller('split-bills')
export class SplitBillOrganizerController {
  constructor(
    private readonly organizerService: SplitBillOrganizerService,
  ) {}

  @Get(':id/organizers')
  @ApiOperation({ summary: 'List organisers for a split bill' })
  list(@Param('id') splitBillId: string) {
    return this.organizerService.list(splitBillId);
  }

  @Post(':id/organizers')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Add an organiser to a split bill (creator only)',
  })
  create(
    @CurrentUser() user: User,
    @Param('id') splitBillId: string,
    @Body() dto: CreateSplitBillOrganizerDto,
  ) {
    return this.organizerService.create(splitBillId, user.id, dto);
  }

  @Patch('organizers/:organizerId')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update an organiser (creator only)' })
  update(
    @CurrentUser() user: User,
    @Param('organizerId') organizerId: string,
    @Body() dto: UpdateSplitBillOrganizerDto,
  ) {
    return this.organizerService.update(organizerId, user.id, dto);
  }

  @Delete('organizers/:organizerId')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Remove an organiser (creator only)' })
  remove(
    @CurrentUser() user: User,
    @Param('organizerId') organizerId: string,
  ) {
    return this.organizerService.remove(organizerId, user.id);
  }

  @Post('organizers/:organizerId/accept')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Accept an organiser invitation (invitee only)' })
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
      'Decline an organiser invitation (invitee only) — optional rejection reason',
  })
  reject(
    @CurrentUser() user: User,
    @Param('organizerId') organizerId: string,
    @Body() dto: RejectSplitBillOrganizerInvitationDto,
  ) {
    return this.organizerService.reject(organizerId, user.id, dto.reason);
  }

  @Get('me/organizer-invitations')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'List pending split-bill organiser invitations for the current user',
  })
  myInvitations(@CurrentUser() user: User) {
    return this.organizerService.listInvitations(user.id);
  }
}
