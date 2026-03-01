import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Campaign, Donation } from './entities';
import { CampaignRepository, DonationRepository } from './repository';
import { CampaignService, DonationService } from './services';
import { CampaignController } from './controllers/campaign.controller';
import { WalletModule } from '../wallet/wallet.module';
import { TransactionModule } from '../transaction/transaction.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Campaign, Donation]),
    forwardRef(() => WalletModule),
    TransactionModule,
    UserModule,
  ],
  controllers: [CampaignController],
  providers: [
    CampaignService,
    DonationService,
    CampaignRepository,
    DonationRepository,
  ],
  exports: [CampaignService, DonationService, CampaignRepository, DonationRepository],
})
export class CampaignModule {}
