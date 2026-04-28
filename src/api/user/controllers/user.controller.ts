import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
}
