import {
  Controller,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../user/entities';
import { PointsService } from '../services/points.service';

@ApiTags('GreyPoints')
@ApiBearerAuth('JWT-auth')
@Controller('points')
export class PointsController {
  constructor(private readonly pointsService: PointsService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: "Current user's GreyPoints total + per-section breakdown",
  })
  async myBreakdown(@CurrentUser() user: User) {
    const breakdown = await this.pointsService.getUserBreakdown(user.id);
    return { ...breakdown, visible: true };
  }

  // Public — respects target's privacy toggle. Auth guard still
  // applied so anonymous web traffic can't scrape totals.
  @Get('user/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      "Another user's GreyPoints breakdown (returns visible=false if hidden)",
  })
  async publicBreakdown(@Param('userId') userId: string) {
    return this.pointsService.getPublicBreakdown(userId);
  }

  @Get('rules')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'List the active points-rules table (read-only until admin UI lands)',
  })
  async listRules() {
    return this.pointsService.listRules();
  }
}
