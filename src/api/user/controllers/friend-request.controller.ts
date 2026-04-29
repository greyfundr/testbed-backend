import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../entities';
import { FriendRequestService } from '../services/friend-request.service';
import {
  SendFriendRequestDto,
  UpdateFriendRequestDto,
} from '../dtos/friend-request.dto';

@ApiTags('Friends')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('users/friends')
export class FriendRequestController {
  constructor(private readonly friendRequestService: FriendRequestService) {}

  @Post('requests')
  @ApiOperation({ summary: 'Send a friend request' })
  sendRequest(@CurrentUser() user: User, @Body() dto: SendFriendRequestDto) {
    return this.friendRequestService.sendRequest(user.id, dto);
  }

  @Get('requests')
  @ApiOperation({
    summary: 'Get pending friend requests received by the current user',
  })
  getPendingRequests(@CurrentUser() user: User) {
    return this.friendRequestService.getPendingRequests(user.id);
  }

  @Delete('requests/:id/cancel')
  @ApiOperation({ summary: 'Cancel a sent friend request' })
  cancelRequest(@CurrentUser() user: User, @Param('id') id: string) {
    return this.friendRequestService.cancelRequest(user.id, id);
  }

  @Patch('requests/:id')
  @ApiOperation({ summary: 'Accept or reject a friend request' })
  updateRequestStatus(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateFriendRequestDto,
  ) {
    return this.friendRequestService.updateRequestStatus(user.id, id, dto);
  }

  @Get('')
  @ApiOperation({ summary: 'Get a list of friends' })
  getFriends(@CurrentUser() user: User) {
    return this.friendRequestService.getFriends(user.id);
  }

  @Delete(':friendId')
  @ApiOperation({ summary: 'Remove a friend' })
  removeFriend(@CurrentUser() user: User, @Param('friendId') friendId: string) {
    return this.friendRequestService.removeFriend(user.id, friendId);
  }
}
