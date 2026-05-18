import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../user/entities';
import { ChatService } from '../services/chat.service';
import { SendChatMessageDto } from '../dto/send-chat-message.dto';

@ApiTags('Chat (direct messages)')
@Controller('chats')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // All conversations the viewer is part of, ordered by last activity.
  @Get()
  @ApiOperation({
    summary: 'List every conversation the viewer participates in',
  })
  listConversations(@CurrentUser() user: User) {
    return this.chatService.listConversations(user.id);
  }

  // Friends (mutual followers) the viewer can start a new chat with.
  // Powers the New Message picker on the conversations list screen.
  @Get('contacts')
  @ApiOperation({
    summary: 'List mutual followers eligible to message',
  })
  listEligibleContacts(@CurrentUser() user: User) {
    return this.chatService.listEligibleContacts(user.id);
  }

  // Paginated message list with a single other user. `before` is the
  // createdAt of the oldest message currently rendered; the response
  // returns up to `limit` older messages.
  @Get('with/:userId')
  @ApiOperation({ summary: 'List messages between viewer and userId' })
  listConversation(
    @CurrentUser() user: User,
    @Param('userId') otherUserId: string,
    @Query('limit') limitRaw?: string,
    @Query('before') beforeRaw?: string,
  ) {
    const limit = limitRaw ? Math.max(1, Math.min(100, +limitRaw)) : 50;
    const before = beforeRaw ? new Date(beforeRaw) : undefined;
    return this.chatService.listConversation(user.id, otherUserId, {
      limit,
      before,
    });
  }

  @Post('with/:userId')
  @ApiOperation({ summary: 'Send a message to userId' })
  send(
    @CurrentUser() user: User,
    @Param('userId') otherUserId: string,
    @Body() dto: SendChatMessageDto,
  ) {
    return this.chatService.sendMessage(user.id, otherUserId, dto.body);
  }

  @Post('with/:userId/read')
  @ApiOperation({ summary: 'Mark every message FROM userId as read' })
  async markRead(
    @CurrentUser() user: User,
    @Param('userId') otherUserId: string,
  ) {
    const affected = await this.chatService.markRead(user.id, otherUserId);
    return { success: true, affected };
  }
}
