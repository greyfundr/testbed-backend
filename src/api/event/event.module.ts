import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventController } from './controllers/event.controller';
import { EventService } from './services/event.service';
import {
  Event,
  EventCategory,
  EventOrganizer,
  EventContribution,
} from './entities';
import {
  EventRepository,
  EventCategoryRepository,
  EventOrganizerRepository,
  EventContributionRepository,
} from './repository';
import { EventGateway } from './gateways/event.gateway';
import { WalletModule } from '../wallet/wallet.module';
import { TransactionModule } from '../transaction/transaction.module';
import { UserModule } from '../user/user.module';
import { PaymentModule } from '../payment/payment.module';
import { DynamicLinkModule } from '../dynamic-link/dynamic-link.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Event,
      EventCategory,
      EventOrganizer,
      EventContribution,
    ]),
    forwardRef(() => WalletModule),
    forwardRef(() => TransactionModule),
    UserModule,
    forwardRef(() => PaymentModule),
    forwardRef(() => DynamicLinkModule),
  ],
  controllers: [EventController],
  providers: [
    EventService,
    EventGateway,
    EventRepository,
    EventCategoryRepository,
    EventOrganizerRepository,
    EventContributionRepository,
  ],
  exports: [EventService],
})
export class EventModule {}
