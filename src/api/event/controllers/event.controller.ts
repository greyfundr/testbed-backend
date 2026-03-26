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
import { EventService } from '../services/event.service';
import { Event, EventContribution } from '../entities';
import {
  CreateEventDto,
  ContributeToEventDto,
  UpdateEventDraftDto,
  GetAllEventsDto,
  GetMyEventsDto,
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
    return this.eventService.contribute(id, contributeDto, user);
  }

  @ApiOperation({ summary: 'Get leaderboard for an event' })
  @ApiResponse({
    status: 200,
    description: 'Return the event leaderboard.',
  })
  @Get(':id/leaderboard')
  async getLeaderboard(@Param('id') id: string) {
    return this.eventService.getLeaderboard(id);
  }
}
