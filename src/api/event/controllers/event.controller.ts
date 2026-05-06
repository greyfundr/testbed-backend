import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Patch,
  Query,
  Delete,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { EventService } from '../services/event.service';
import { Event, EventContribution, RsvpStatus } from '../entities';
import {
  CreateEventDto,
  ContributeToEventDto,
  UpdateEventDraftDto,
  GetAllEventsDto,
  GetMyEventsDto,
  RsvpDto,
  GuestRsvpDto,
  UpdateRsvpDto,
  GetMyRsvpEventsDto,
  GetListingsDto,
} from '../dto/event.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { User } from '../../user/entities';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Events')
@Controller('events')
export class EventController {
  constructor(private readonly eventService: EventService) {}

  @ApiOperation({ summary: 'Create a new event' })
  @ApiResponse({
    status: 201,
    description: 'The event has been successfully created.',
    type: Event,
  })
  @ApiBearerAuth('JWT-auth')
  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createEventDto: CreateEventDto,
    @CurrentUser() user: User,
  ) {
    return this.eventService.create(createEventDto, user);
  }

  @ApiOperation({ summary: 'Update an event draft' })
  @ApiResponse({
    status: 200,
    description: 'The event draft has been successfully updated.',
    type: Event,
  })
  @ApiBearerAuth('JWT-auth')
  @Patch(':id/draft')
  @UseGuards(JwtAuthGuard)
  async updateDraft(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateEventDraftDto,
  ) {
    const event = await this.eventService.updateEventDraft(id, dto, user.id);
    return {
      success: true,
      message:
        dto.pageNumber === 4
          ? 'Event published successfully'
          : `Step ${dto.pageNumber} saved`,
      data: event,
    };
  }

  @ApiOperation({ summary: 'Get all active events' })
  @ApiResponse({
    status: 200,
    description: 'Return all active events.',
    type: [Event],
  })
  @Get()
  async findAll(@Query() dto: GetAllEventsDto) {
    return this.eventService.findAll(dto);
  }

  @ApiOperation({ summary: 'Get my events' })
  @ApiResponse({
    status: 200,
    description: 'Return all my events.',
    type: [Event],
  })
  @Get('my-events')
  @UseGuards(JwtAuthGuard)
  async getMyEvents(@CurrentUser() user: User, @Query() dto: GetMyEventsDto) {
    return this.eventService.getMyEvents(user.id, dto);
  }

  @ApiOperation({ summary: 'Get an event by ID' })
  @ApiResponse({
    status: 200,
    description: 'Return the event.',
    type: Event,
  })
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.eventService.findOne(id);
  }

  @ApiOperation({
    summary: 'Contribute to an event (Donation/Purchase/Gifting)',
  })
  @ApiResponse({
    status: 201,
    description: 'The contribution was successful.',
    type: EventContribution,
  })
  @ApiBearerAuth('JWT-auth')
  @Post(':id/contribute')
  @UseGuards(JwtAuthGuard)
  async contribute(
    @Param('id') id: string,
    @Body() contributeDto: ContributeToEventDto,
    @CurrentUser() user: User,
  ) {
    return await this.eventService.contribute(id, contributeDto, user);
  }

  @ApiOperation({ summary: 'Get leaderboard for an event' })
  @ApiResponse({
    status: 200,
    description: 'Return the event leaderboard.',
  })
  @UseGuards(JwtAuthGuard)
  @Get(':id/leaderboard')
  async getLeaderboard(@Param('id') id: string) {
    return this.eventService.getLeaderboard(id);
  }

  @ApiOperation({ summary: 'Get all individual contributions for an event' })
  @ApiResponse({
    status: 200,
    description: 'Return list of individual contributions with comments.',
  })
  @UseGuards(JwtAuthGuard)
  @Get(':id/contributions')
  async getContributions(@Param('id') id: string) {
    return this.eventService.getContributionHistory(id);
  }

  @ApiOperation({
    summary: 'RSVP to an event (for authenticated users)',
  })
  @ApiResponse({
    status: 201,
    description: 'The RSVP was successful.',
    type: EventContribution,
  })
  @ApiBearerAuth('JWT-auth')
  @Post(':eventId/rsvp')
  @UseGuards(JwtAuthGuard)
  async rsvp(
    @Param('eventId') eventId: string,
    @CurrentUser() user: User,
    @Body() dto: RsvpDto,
  ) {
    const rsvp = await this.eventService.rsvpAsUser(eventId, user, dto);
    return {
      success: true,
      message: `RSVP recorded — you are marked as "${rsvp.status}"`,
      data: rsvp,
    };
  }

  @ApiOperation({
    summary: 'RSVP to an event (for guests without an account)',
  })
  @ApiResponse({
    status: 201,
    description: 'The RSVP was successful.',
    type: EventContribution,
  })
  @ApiBearerAuth('JWT-auth')
  @Post(':eventId/rsvp/guest')
  @UseGuards(JwtAuthGuard)
  async rsvpAsGuest(
    @Param('eventId') eventId: string,
    @Body() dto: GuestRsvpDto,
  ) {
    const rsvp = await this.eventService.rsvpAsGuest(eventId, dto);
    return {
      success: true,
      message: `RSVP recorded — you are marked as "${rsvp.status}"`,
      data: rsvp,
    };
  }

  @ApiOperation({
    summary: 'Update your RSVP for an event',
  })
  @ApiResponse({
    status: 200,
    description: 'The RSVP update was successful.',
    type: EventContribution,
  })
  @ApiBearerAuth('JWT-auth')
  @Patch(':eventId/event/rsvp/:rsvpId')
  @UseGuards(JwtAuthGuard)
  async updateRsvp(
    @Param('rsvpId') rsvpId: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateRsvpDto,
  ) {
    const rsvp = await this.eventService.updateRsvp(rsvpId, user.id, dto);
    return {
      success: true,
      message: 'RSVP updated',
      data: rsvp,
    };
  }

  @ApiOperation({
    summary: 'Delete your RSVP for an event',
  })
  @ApiResponse({
    status: 200,
    description: 'The RSVP deletion was successful.',
    type: EventContribution,
  })
  @ApiBearerAuth('JWT-auth')
  @Delete(':eventId/event/rsvp/:rsvpId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async cancelRsvp(@Param('rsvpId') rsvpId: string, @CurrentUser() user: User) {
    await this.eventService.cancelRsvp(rsvpId, user.id);
    return { success: true, message: 'RSVP cancelled' };
  }

  @ApiOperation({
    summary: 'Get your RSVP for an event',
  })
  @ApiResponse({
    status: 200,
    description: 'The RSVP retrieval was successful.',
    type: EventContribution,
  })
  @ApiBearerAuth('JWT-auth')
  @Get(':eventId/event/rsvp/me')
  @UseGuards(JwtAuthGuard)
  async getMyRsvp(
    @Param('eventId') eventId: string,
    @CurrentUser() user: User,
  ) {
    const rsvp = await this.eventService.getMyRsvp(eventId, user.id);
    return { success: true, data: rsvp };
  }

  @ApiOperation({
    summary: 'Get all RSVPs for an event (organizers only)',
  })
  @ApiResponse({
    status: 200,
    description: 'The RSVP retrieval was successful.',
    type: EventContribution,
  })
  @ApiBearerAuth('JWT-auth')
  @Get(':eventId/event/rsvp')
  @UseGuards(JwtAuthGuard)
  async getEventRsvps(
    @Param('eventId') eventId: string,
    @CurrentUser() user: User,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
    @Query('status') status?: RsvpStatus,
  ) {
    const result = await this.eventService.getEventRsvps(
      eventId,
      user.id,
      +page,
      +limit,
      status,
    );
    return { success: true, data: result };
  }

  @ApiOperation({ summary: 'Get all events I have RSVPd to' })
  @ApiResponse({
    status: 200,
    description: 'Return events with my RSVP status.',
  })
  @ApiBearerAuth('JWT-auth')
  @Get('my-rsvps/all')
  @UseGuards(JwtAuthGuard)
  async getMyRsvpEvents(
    @CurrentUser() user: User,
    @Query() dto: GetMyRsvpEventsDto,
  ) {
    return this.eventService.getMyRsvpEvents(user.id, dto);
  }

  @ApiOperation({ summary: 'Delete all events (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'All events deleted successfully.',
  })
  @ApiBearerAuth('JWT-auth')
  @Delete()
  @UseGuards(JwtAuthGuard)
  async deleteAll() {
    await this.eventService.deleteAllEvents();
    return { success: true, message: 'All events deleted' };
  }

  @ApiOperation({
    summary: 'Get all purchasable item listings across my events',
  })
  @ApiResponse({
    status: 200,
    description: 'Return all purchasable item listings.',
  })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Get('listings/all')
  async getListings(@CurrentUser() user: User, @Query() dto: GetListingsDto) {
    return this.eventService.getListings(user.id, dto);
  }

  @ApiOperation({ summary: 'Get all listings for a specific event' })
  @ApiResponse({
    status: 200,
    description: 'Return all purchasable item listings for a specific event.',
  })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Get(':eventId/listings')
  async getEventListings(@Param('eventId') eventId: string) {
    const listings = await this.eventService.getEventListings(eventId);
    return { success: true, data: listings };
  }
}
