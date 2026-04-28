import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../entities';
import { FollowService } from '../services/follow.service';
import { FollowUserDto } from '../dtos/follow.dto';

@ApiTags('Follow')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('users/follow')
export class FollowController {
  constructor(private readonly followService: FollowService) {}

  @Post('')
  @ApiOperation({ summary: 'Follow a user' })
  followUser(@CurrentUser() user: User, @Body() dto: FollowUserDto) {
    return this.followService.followUser(user.id, dto.followingId);
  }

  @Delete(':followingId')
  @ApiOperation({ summary: 'Unfollow a user' })
  unfollowUser(
    @CurrentUser() user: User,
    @Param('followingId') followingId: string,
  ) {
    return this.followService.unfollowUser(user.id, followingId);
  }

  @Get('followers/:id')
  @ApiOperation({ summary: 'Get followers of a user' })
  getFollowers(@Param('id') id: string) {
    return this.followService.getFollowers(id);
  }

  @Get('following/:id')
  @ApiOperation({ summary: 'Get users followed by a user' })
  getFollowing(@Param('id') id: string) {
    return this.followService.getFollowing(id);
  }
}
