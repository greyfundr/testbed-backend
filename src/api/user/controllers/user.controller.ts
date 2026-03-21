import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { UserService } from '../services';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../entities';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UpdateProfileDto } from '../dtos';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

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
  geAllUsers(@CurrentUser() user: User) {
    return this.userService.getUsers();
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
}
