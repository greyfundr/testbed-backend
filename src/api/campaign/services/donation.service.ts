import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { DonationRepository } from '../repository/donation.repository';
import { CampaignRepository } from '../repository/campaign.repository';
import { DonateDto } from '../dto/campaign.dto';
import { User } from '../../user/entities/user.entity';
import { WalletService } from '../../wallet/services/wallet.service';
import { Transaction } from '../../transaction/entities';
import { TransactionRepository } from '../../transaction/repository';
import {
  TransactionType,
  TransactionDirection,
  TransactionStatus,
} from '../../transaction/enums/transaction.enum';
import { CampaignStatus, DonationOnBehalfOf } from '../enums/campaign.enum';
import { Donation, Campaign } from '../entities';
import {
  PaginationDto,
  PaginatedResponse,
  PaginationHelper,
} from '../../../common/helpers/pagination.helper';
import { DonationResponseDto, DonorDto } from '../dto/donation-response.dto';

@Injectable()
export class DonationService {
  private readonly logger = new Logger(DonationService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly campaignRepository: CampaignRepository,
    private readonly donationRepository: DonationRepository,
    private readonly transactionRepository: TransactionRepository,
    private readonly walletService: WalletService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async donate(
    campaignId: string,
    donateDto: DonateDto,
    user: User,
  ): Promise<Donation> {
    await this.walletService.verifyTransactionPin(
      user.id,
      donateDto.transactionPin,
    );

    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId },
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    if (campaign.status !== CampaignStatus.ACTIVE) {
      throw new BadRequestException('Campaign is not active for donations');
    }

    const {
      amount,
      isAnonymous,
      username: customUsername,
      onBehalfOf,
      onBehalfOfUserId,
      onBehalfOfExternal,
      comment,
    } = donateDto;

    // A user can either be anonymous or pass a username. It can't be both
    if (isAnonymous && customUsername) {
      throw new BadRequestException(
        'A donation cannot be both anonymous and have a custom username',
      );
    }

    // Validate onBehalfOfUserId if onBehalfOf is USER
    if (onBehalfOf === DonationOnBehalfOf.USER && !onBehalfOfUserId) {
      throw new BadRequestException(
        'onBehalfOfUserId is required when onBehalfOf is USER',
      );
    }

    // Validate onBehalfOfExternal if onBehalfOf is EXTERNAL
    if (onBehalfOf === DonationOnBehalfOf.EXTERNAL && !onBehalfOfExternal) {
      throw new BadRequestException(
        'onBehalfOfExternal is required when onBehalfOf is EXTERNAL',
      );
    }

    const wallet = await this.walletService.getWalletByUserId(user.id);

    if (wallet.availableBalance < amount) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const reference = `DON-${uuidv4().replace(/-/g, '').substring(0, 15).toUpperCase()}`;

      const transaction = await qr.manager.save(
        qr.manager.create(Transaction, {
          walletId: wallet.id,
          amount: amount, // Naira
          currency: 'NGN',
          type: TransactionType.CAMPAIGN_DONATION,
          direction: TransactionDirection.DEBIT,
          status: TransactionStatus.COMPLETED,
          reference,
          description: `Donation to campaign: ${campaign.title}`,
          metadata: { campaignId, donorId: user.id },
        }),
      );

      // Lock funds into campaign escrow
      await this.walletService.lockIntoEscrow({
        walletId: wallet.id,
        amount,
        transactionId: transaction.id,
        entityType: 'campaign',
        entityId: campaign.id,
        description: `Escrow for donation to campaign: ${campaign.title}`,
        qr,
      });

      const donation = qr.manager.create(Donation, {
        amount: amount, // Naira
        donorId: user.id,
        campaignId: campaign.id,
        transactionId: transaction.id,
        isAnonymous: isAnonymous ?? false,
        customUsername,
        onBehalfOf: onBehalfOf ?? DonationOnBehalfOf.SELF,
        onBehalfOfUserId:
          onBehalfOf === DonationOnBehalfOf.USER ? onBehalfOfUserId : undefined,
        onBehalfOfFullName:
          onBehalfOf === DonationOnBehalfOf.EXTERNAL
            ? onBehalfOfExternal?.fullName
            : undefined,
        onBehalfOfPhone:
          onBehalfOf === DonationOnBehalfOf.EXTERNAL
            ? onBehalfOfExternal?.phoneNumber
            : undefined,
        comment,
      });

      const savedDonation = await qr.manager.save(donation);

      // Update campaign current amount
      // Raw SQL update - bypasses transformer 'to', so we use kobo directly
      await qr.manager.update(Campaign, campaign.id, {
        currentAmount: () => `current_amount + ${amount}`,
      });

      await qr.commitTransaction();

      this.logger.log(
        `Donation of ₦${amount} completed by user ${user.id} for campaign ${campaign.id}`,
      );

      // --- Notifications ---
      const trueDonationAmount = amount;

      // 1. Send receipt to donor
      this.eventEmitter.emit('donation.receipt', {
        donorId: user.id,
        email: user.email,
        campaignName: campaign.title,
        amount: trueDonationAmount,
      });

      // 2. Alert the campaign creator
      this.eventEmitter.emit('donation.received', {
        creatorId: campaign.creatorId,
        campaignName: campaign.title,
        amount: trueDonationAmount,
        donorName: isAnonymous ? 'Anonymous' : customUsername || user.firstName,
      });

      // 3. Milestone Checks
      const newCurrentAmount =
        Number(campaign.currentAmount) + trueDonationAmount;
      const targetAmount = Number(campaign.target);

      if (targetAmount > 0) {
        // Did it just hit exactly 50% or 100% boundary?
        const previousAmount = Number(campaign.currentAmount);

        const hit50 =
          previousAmount < targetAmount / 2 &&
          newCurrentAmount >= targetAmount / 2 &&
          newCurrentAmount < targetAmount;
        const hit100 =
          previousAmount < targetAmount && newCurrentAmount >= targetAmount;

        if (hit50 || hit100) {
          this.eventEmitter.emit('campaign.milestone', {
            creatorId: campaign.creatorId,
            campaignName: campaign.title,
            percentage: hit100 ? 100 : 50,
          });
        }
      }

      return savedDonation;
    } catch (err) {
      await qr.rollbackTransaction();
      this.logger.error(
        `Donation failed for user ${user.id} to campaign ${campaign.id}`,
        err,
      );
      throw err;
    } finally {
      await qr.release();
    }
  }

  async getCampaignDonations(
    campaignId: string,
    paginationDto: PaginationDto,
  ): Promise<PaginatedResponse<DonationResponseDto>> {
    const { page, limit } = paginationDto;
    const skip = paginationDto.getSkip();

    const [data, total] = await this.donationRepository.findAndCount({
      where: { campaignId },
      relations: [
        'donor',
        'donor.profile',
        'onBehalfOfUser',
        'onBehalfOfUser.profile',
      ],
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return PaginationHelper.createResponse(
      data.map((donation) => this.mapToResponse(donation)),
      total,
      page ?? 1,
      limit ?? 10,
    );
  }

  public mapToResponse(donation: Donation): DonationResponseDto {
    const { donor, onBehalfOfUser, isAnonymous } = donation;

    const mappedDonor: DonorDto | undefined =
      isAnonymous || !donor
        ? undefined
        : {
            id: donor.id,
            firstName: donor.firstName ?? undefined,
            lastName: donor.lastName ?? undefined,
            username: donor.username ?? undefined,
            profileImage: donor.profile?.image ?? undefined,
          };

    const mappedOnBehalfOfUser: DonorDto | undefined = onBehalfOfUser
      ? {
          id: onBehalfOfUser.id,
          firstName: onBehalfOfUser.firstName ?? undefined,
          lastName: onBehalfOfUser.lastName ?? undefined,
          username: onBehalfOfUser.username ?? undefined,
          profileImage: onBehalfOfUser.profile?.image ?? undefined,
        }
      : undefined;

    return {
      id: donation.id,
      amount: donation.amount,
      isAnonymous: Boolean(donation.isAnonymous),
      customUsername: donation.customUsername ?? undefined,
      onBehalfOf: donation.onBehalfOf,
      comment: donation.comment ?? undefined,
      donor: mappedDonor,
      onBehalfOfUser: mappedOnBehalfOfUser,
      onBehalfOfFullName: donation.onBehalfOfFullName ?? undefined,
      createdAt: donation.createdAt,
    };
  }
}
