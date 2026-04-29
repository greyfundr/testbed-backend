import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Campaign, CampaignCategory, Donation, CampaignLike, CampaignComment } from './entities';
import { CampaignRepository, DonationRepository } from './repository';
import { CampaignService, DonationService, CampaignInteractionService } from './services';
import { CampaignController } from './controllers/campaign.controller';
import { WalletModule } from '../wallet/wallet.module';
import { TransactionModule } from '../transaction/transaction.module';
import { UserModule } from '../user/user.module';
import { CampaignCategoryRepository } from './repository/campaign-category.repository';
import { PaymentService } from '../payment/services';
import { CampaignInteractionController } from './controllers/campaign-interaction.controller';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Campaign, Donation, CampaignCategory, CampaignLike, CampaignComment]),
    forwardRef(() => WalletModule),
    TransactionModule,
    forwardRef(() => UserModule),
    forwardRef(() => NotificationModule),
  ],
  controllers: [CampaignController, CampaignInteractionController],
  providers: [
    CampaignService,
    DonationService,
    CampaignRepository,
    DonationRepository,
    CampaignCategoryRepository,
    PaymentService,
    CampaignInteractionService,
  ],
  exports: [
    CampaignService,
    DonationService,
    CampaignRepository,
    DonationRepository,
    CampaignInteractionService,
  ],
})
export class CampaignModule {}
