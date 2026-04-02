import { Module, Global } from '@nestjs/common';
import { TermiiService } from './services/termii.service';
import { ConfigModule } from '@nestjs/config';
import { WhatsAppService } from './services/whatsapp.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [TermiiService, WhatsAppService],
  exports: [TermiiService, WhatsAppService],
})
export class CommonModule {}
