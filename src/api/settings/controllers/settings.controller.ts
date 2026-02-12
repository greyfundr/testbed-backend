import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SettingsService } from '../services/settings.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../user/entities/user.entity';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UpdateSettingsDto, VerifyTwoFactorDto } from '../dtos/settings.dto';

@ApiTags('Settings')
@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @ApiOperation({ summary: 'Get user settings' })
  @ApiBearerAuth('JWT-auth')
  @Get()
  async getSettings(@CurrentUser() user: User) {
    return await this.settingsService.getSettings(user.id);
  }

  @Patch('/update')
  @ApiOperation({ summary: 'Update user settings' })
  @HttpCode(HttpStatus.OK)
  async updateSettings(
    @CurrentUser() user: User,
    @Body() updateDto: UpdateSettingsDto,
  ) {
    return this.settingsService.updateSettings(user.id, updateDto);
  }
}
