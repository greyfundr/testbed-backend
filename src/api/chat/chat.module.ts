import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatMessage } from './entities/chat-message.entity';
import { User } from '../user/entities';
import { Block } from '../user/entities';
import { ChatService } from './services/chat.service';
import { ChatController } from './controllers/chat.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ChatMessage, User, Block])],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
