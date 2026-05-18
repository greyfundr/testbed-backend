import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { UserService } from '../services';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../entities';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { GetUsersFilterDto, SetFcmTokenDto, UpdateProfileDto } from '../dtos';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @UseInterceptors(ClassSerializerInterceptor)
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@CurrentUser() user: User) {
    return this.userService.getUserProfile(user.id);
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Get('me/stats')
  @ApiOperation({
    summary: "Counts shown in the dashboard header for the current user",
  })
  getMyStats(@CurrentUser() user: User) {
    return this.userService.getMyStats(user.id);
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  @ApiOperation({ summary: 'Update user profile' })
  updateProfile(
    @CurrentUser() user: User,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.userService.updateProfile(user, updateProfileDto);
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Get('')
  getAllUsers(
    @Query() filterDto: GetUsersFilterDto,
    @CurrentUser() user: User,
  ) {
    return this.userService.getUsers(filterDto, user.id);
  }

  @Delete('account')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete user account' })
  async deleteAccount(@CurrentUser() user: User) {
    await this.userService.deleteAccount(user.id);
    return {
      success: true,
      message: 'Your account has been successfully deleted.',
    };
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Patch('set-fcm-token')
  @ApiOperation({ summary: 'Set fcm (push notifications) token' })
  setFcmToken(@CurrentUser() user: User, @Body() dto: SetFcmTokenDto) {
    return this.userService.updateFcmToken(user.id, dto.fcmToken);
  }

  // Public-profile fetch — returns the lightweight identity payload plus
  // followers/following counts and relationship flags (iFollowThem,
  // followsMe, isFriends, isSelf) that the OtherUserProfileScreen needs
  // to render the Follow / Following / Friends button.
  //
  // Kept last so it can't shadow the static routes above (`profile`,
  // `me/stats`, `set-fcm-token`).
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Get(':id/public-profile')
  @ApiOperation({
    summary: "Public-facing profile for any user (counts + relationship)",
  })
  getPublicProfile(
    @CurrentUser() viewer: User,
    @Param('id') targetUserId: string,
  ) {
    return this.userService.getPublicProfile(targetUserId, viewer.id);
  }
}
