import { Module, Global } from '@nestjs/common';
import { TermiiService } from './services/termii.service';
import { ConfigModule } from '@nestjs/config';
import { WhatsAppService } from './services/whatsapp.service';
import { UserKycService } from './services/kyc-verification.service';
import { HttpModule } from '@nestjs/axios';

@Global()
@Module({
  imports: [ConfigModule, HttpModule],
  providers: [TermiiService, WhatsAppService, UserKycService],
  exports: [TermiiService, WhatsAppService, UserKycService, HttpModule],
})
export class CommonModule {}
