import { Module, Global } from '@nestjs/common';
import { TermiiService } from './services/termii.service';
import { ConfigModule } from '@nestjs/config';
import { WhatsAppService } from './services/whatsapp.service';
import { UserKycService } from './services/kyc-verification.service';
import { HttpModule } from '@nestjs/axios';
import { AppLiveGateway } from './gateways/socket.gateway';

@Global()
@Module({
  imports: [ConfigModule, HttpModule],
  providers: [TermiiService, WhatsAppService, UserKycService, AppLiveGateway],
  exports: [TermiiService, WhatsAppService, UserKycService, HttpModule],
})
export class CommonModule {}
