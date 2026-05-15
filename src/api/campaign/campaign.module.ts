import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Campaign,
  CampaignCategory,
  Donation,
  CampaignLike,
  CampaignComment,
  CampaignOrganizer,
  CampaignOrganizerFollow,
  CampaignAmplifier,
  CampaignExpenditure,
  CampaignSave,
  CampaignVendor,
  CampaignProposal,
  CampaignProposalAllocation,
  CampaignProposalVote,
  CampaignUpdate,
} from './entities';
import { CampaignRepository, DonationRepository } from './repository';
import {
  CampaignService,
  DonationService,
  CampaignInteractionService,
  CampaignSaveService,
  CampaignOrganizerService,
  CampaignAmplifierService,
  CampaignExpenditureService,
  CampaignVendorService,
  CampaignProposalService,
  CampaignUpdateService,
} from './services';
import { CampaignController } from './controllers/campaign.controller';
import { CampaignOrganizerController } from './controllers/campaign-organizer.controller';
import { CampaignExtrasController } from './controllers/campaign-extras.controller';
import { CampaignGovernanceController } from './controllers/campaign-governance.controller';
import { CampaignUpdateController } from './controllers/campaign-update.controller';
import { WalletModule } from '../wallet/wallet.module';
import { TransactionModule } from '../transaction/transaction.module';
import { UserModule } from '../user/user.module';
import { CampaignCategoryRepository } from './repository/campaign-category.repository';
import { PaymentService } from '../payment/services';
import { CampaignInteractionController } from './controllers/campaign-interaction.controller';
import { NotificationModule } from '../notification/notification.module';
import { CampaignSubscriber } from './subscribers/campaign.subscriber';
import { DynamicLinkModule } from '../dynamic-link/dynamic-link.module';
import { User } from '../user/entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Campaign,
      Donation,
      CampaignCategory,
      CampaignLike,
      CampaignComment,
      CampaignOrganizer,
      CampaignOrganizerFollow,
      CampaignAmplifier,
      CampaignExpenditure,
      CampaignSave,
      CampaignVendor,
      CampaignProposal,
      CampaignProposalAllocation,
      CampaignProposalVote,
      CampaignUpdate,
      // Needed by CampaignOrganizerService to look up invitees and
      // gate the create() flow when a userId is provided.
      User,
    ]),
    forwardRef(() => WalletModule),
    TransactionModule,
    forwardRef(() => UserModule),
    forwardRef(() => NotificationModule),
    DynamicLinkModule,
  ],
  controllers: [
    CampaignController,
    CampaignInteractionController,
    CampaignOrganizerController,
    CampaignExtrasController,
    CampaignGovernanceController,
    CampaignUpdateController,
  ],
  providers: [
    CampaignService,
    DonationService,
    CampaignRepository,
    DonationRepository,
    CampaignCategoryRepository,
    PaymentService,
    CampaignInteractionService,
    CampaignSubscriber,
    CampaignSaveService,
    CampaignOrganizerService,
    CampaignAmplifierService,
    CampaignExpenditureService,
    CampaignVendorService,
    CampaignProposalService,
    CampaignUpdateService,
  ],
  exports: [
    CampaignService,
    DonationService,
    CampaignRepository,
    DonationRepository,
    CampaignInteractionService,
    CampaignSaveService,
    CampaignOrganizerService,
    CampaignAmplifierService,
    CampaignExpenditureService,
    CampaignVendorService,
    CampaignProposalService,
    CampaignUpdateService,
  ],
})
export class CampaignModule {}
