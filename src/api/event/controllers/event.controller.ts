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
  UpdateEventDto,
  ContributeToEventDto,
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

  @ApiOperation({ summary: 'Get all active events' })
  @ApiResponse({
    status: 200,
    description: 'Return all active events.',
    type: [Event],
  })
  @Get()
  async findAll(@Query('categoryId') categoryId?: string) {
    return this.eventService.findAll(categoryId);
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
