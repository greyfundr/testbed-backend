// notification/notification.controller.ts

import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../user/entities';
import { NotificationService } from '../services/notification.service';
import {
  GetNotificationsDto,
  MarkNotificationsReadDto,
} from '../dtos/notification.dto';

@ApiTags('Notifications')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'Get my notifications with unread count' })
  async getNotifications(
    @CurrentUser() user: User,
    @Query() dto: GetNotificationsDto,
  ) {
    return this.notificationService.getUserNotifications(user.id, dto);
  }

  @Patch('read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Mark notifications as read. Pass ids[] to mark specific ones, or omit to mark all.',
  })
  async markAsRead(
    @CurrentUser() user: User,
    @Body() dto: MarkNotificationsReadDto,
  ) {
    const result = await this.notificationService.markAsRead(user.id, dto);
    return {
      success: true,
      message: `${result.updated} notification(s) marked as read`,
      data: result,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a notification' })
  async deleteNotification(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    await this.notificationService.deleteNotification(user.id, id);
    return { success: true, message: 'Notification deleted' };
  }
}
