import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { SettingsService } from '../services';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../entities';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UpdateSettingsDto } from '../dtos';

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @ApiOperation({ summary: 'Get user settings' })
  @ApiBearerAuth('JWT-auth')
  @Get()
  async getSettings(@CurrentUser() user: User) {
    console.log('user', user);
    const data = await this.settingsService.getSettings(user.uuid);

    return {
      success: true,
      message: 'Settings retrieved successfully',
      data,
    };
  }

  @Patch('/update')
  @ApiOperation({ summary: 'Update user settings' })
  @HttpCode(HttpStatus.OK)
  async updateSettings(
    @CurrentUser() user: User,
    @Body() updateDto: UpdateSettingsDto,
  ) {
    return this.settingsService.updateSettings(user.uuid, updateDto);
  }
}
