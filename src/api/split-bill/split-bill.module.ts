import { forwardRef, Module } from '@nestjs/common';
import { SplitBillController } from './controllers/split-bill.controller';
import { SplitBillGovernanceController } from './controllers/split-bill-governance.controller';
import { SplitBillService } from './services/split-bill.service';
import { SplitBillGovernanceService } from './services/split-bill-governance.service';
import { SplitBillUpdateService } from './services/split-bill-update.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  SplitBill,
  SplitBillActivity,
  SplitBillComment,
  SplitBillParticipant,
  SplitBillVendor,
  SplitBillProposal,
  SplitBillProposalVote,
  SplitBillUpdate,
} from './entities';
import { UserModule } from '../user/user.module';
import { WalletModule } from '../wallet/wallet.module';
import { TransactionModule } from '../transaction/transaction.module';
import { PaymentService } from '../payment/services';
import { DynamicLinkModule } from '../dynamic-link/dynamic-link.module';
import { NotificationModule } from '../notification/notification.module';
import { SplitBillSubscriber } from './subscribers/split-bill.subscriber';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SplitBill,
      SplitBillParticipant,
      SplitBillActivity,
      SplitBillComment,
      SplitBillVendor,
      SplitBillProposal,
      SplitBillProposalVote,
      SplitBillUpdate,
    ]),
    forwardRef(() => UserModule),
    forwardRef(() => WalletModule),
    forwardRef(() => TransactionModule),
    DynamicLinkModule,
    forwardRef(() => NotificationModule),
  ],
  controllers: [SplitBillController, SplitBillGovernanceController],
  providers: [
    SplitBillService,
    SplitBillGovernanceService,
    SplitBillUpdateService,
    PaymentService,
    SplitBillSubscriber,
  ],
  exports: [
    SplitBillService,
    SplitBillGovernanceService,
    SplitBillUpdateService,
  ],
})
export class SplitBillModule {}
