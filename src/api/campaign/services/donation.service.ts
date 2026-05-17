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
import { DonateDto, PaymentMethod } from '../dto/campaign.dto';
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
import { PaymentService } from 'src/api/payment/services';
import { CampaignAmplifierService } from './campaign-amplifier.service';
import { PointsService } from '../../points/services/points.service';

@Injectable()
export class DonationService {
  private readonly logger = new Logger(DonationService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly campaignRepository: CampaignRepository,
    private readonly donationRepository: DonationRepository,
    private readonly transactionRepository: TransactionRepository,
    private readonly paymentService: PaymentService,
    private readonly walletService: WalletService,
    private readonly eventEmitter: EventEmitter2,
    private readonly amplifierService: CampaignAmplifierService,
    private readonly pointsService: PointsService,
  ) {}

  // Resolves a donation's referrer-amplifier (if any) to the champion's
  // userId, then awards every relevant GreyPoints ledger row in one
  // call. Always wrapped in try/catch by the caller — a points hiccup
  // must never block a confirmed donation.
  private async awardDonationPoints(
    donation: import('../entities').Donation,
    payerId: string,
  ): Promise<void> {
    // Loud sentinel so we can confirm from logs that the hook was
    // even reached. If this line doesn't show in Render logs after
    // a wallet donation, the deploy didn't pick up the new code.
    this.logger.log(
      `[GP-HOOK] awardDonationPoints entered: donation=${donation.id} payer=${payerId} ` +
        `amount=${donation.amount} onBehalfOf=${donation.onBehalfOf} ` +
        `referrerAmplifierId=${donation.referrerAmplifierId ?? 'none'}`,
    );
    try {
      let championUserId: string | null = null;
      if (donation.referrerAmplifierId) {
        const amp = await this.amplifierService.getById(
          donation.referrerAmplifierId,
        );
        championUserId = amp?.userId ?? null;
      }
      this.logger.log(
        `[GP-HOOK] pointsService injected=${!!this.pointsService} ` +
          `awardForDonation typeof=${typeof this.pointsService?.awardForDonation}`,
      );
      await this.pointsService.awardForDonation({
        payerId,
        donation,
        championUserId,
      });
      this.logger.log(
        `[GP-HOOK] awardForDonation returned for donation=${donation.id}`,
      );
    } catch (err) {
      this.logger.error(
        `[GP-HOOK] awardDonationPoints failed (donation=${donation.id}): ${(err as Error).message}\n${(err as Error).stack}`,
      );
    }
  }

  /** Resolve a referral code to its amplifier id, scoped to this campaign. */
  private async resolveReferrerAmplifierId(
    code: string | undefined,
    campaignId: string,
  ): Promise<string | null> {
    if (!code) return null;
    const amp = await this.amplifierService.getByCode(code);
    if (!amp || amp.campaignId !== campaignId) return null;
    return amp.id;
  }

  async donate(
    campaignId: string,
    donateDto: DonateDto,
    user: User,
  ): Promise<any> {
    const {
      amount,
      isAnonymous,
      username,
      onBehalfOf,
      onBehalfOfExternal,
      onBehalfOfUserId,
      paymentMethod,
      transactionPin,
    } = donateDto;

    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId },
    });

    if (!campaign) throw new NotFoundException('Campaign not found');

    if (campaign.status !== CampaignStatus.ACTIVE) {
      throw new BadRequestException('Campaign is not active for donations');
    }

    if (isAnonymous && username) {
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

    if (paymentMethod === PaymentMethod.WALLET) {
      if (!transactionPin) {
        throw new BadRequestException(
          'Transaction PIN is required for wallet payments',
        );
      }

      await this.walletService.verifyTransactionPin(user.id, transactionPin);

      const wallet = await this.walletService.getWalletByUserId(user.id);
      if (wallet.availableBalance < amount) {
        throw new BadRequestException('Insufficient wallet balance');
      }

      return await this.executeWalletDonation(
        campaign,
        donateDto,
        user,
        wallet,
      );
    }

    if (paymentMethod === PaymentMethod.PAYSTACK) {
      return this.initializePaystackDonation(campaign, donateDto, user);
    }
  }

  private async executeWalletDonation(
    campaign: Campaign,
    donateDto: DonateDto,
    user: User,
    wallet: any,
  ) {
    const {
      amount,
      isAnonymous,
      username: customUsername,
      onBehalfOf,
      onBehalfOfUserId,
      onBehalfOfExternal,
      comment,
    } = donateDto;

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const reference = `DON-${uuidv4().replace(/-/g, '').substring(0, 15).toUpperCase()}`;

      const transaction = await qr.manager.save(
        qr.manager.create(Transaction, {
          walletId: wallet.id,
          amount,
          currency: 'NGN',
          type: TransactionType.CAMPAIGN_DONATION,
          direction: TransactionDirection.DEBIT,
          status: TransactionStatus.COMPLETED,
          reference,
          description: `Donation to campaign: ${campaign.title}`,
          metadata: { campaignId: campaign.id, donorId: user.id },
        }),
      );

      await this.walletService.lockIntoEscrow({
        walletId: wallet.id,
        amount,
        transactionId: transaction.id,
        entityType: 'campaign',
        entityId: campaign.id,
        description: `Escrow for donation to campaign: ${campaign.title}`,
        qr,
      });

      const referrerAmplifierId = await this.resolveReferrerAmplifierId(
        donateDto.referrerCode,
        campaign.id,
      );

      const donation = qr.manager.create(Donation, {
        amount,
        donorId: onBehalfOfUserId ? onBehalfOfUserId : user.id,
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
        referrerAmplifierId,
      });

      const savedDonation = await qr.manager.save(donation);

      await qr.manager.update(Campaign, campaign.id, {
        currentAmount: () => `current_amount + ${amount}`,
      });

      const updatedCampaign = await qr.manager.findOne(Campaign, {
        where: { id: campaign.id },
        relations: ['creator'],
      });

      await qr.commitTransaction();

      const donor = onBehalfOfUserId
        ? await qr.manager.findOne(User, { where: { id: onBehalfOfUserId } })
        : user;

      this.triggerDonationEvents(
        updatedCampaign as Campaign,
        donor as User,
        amount,
        isAnonymous as boolean,
        customUsername as string,
      );

      // GreyPoints — `user.id` is the actual payer; `savedDonation`
      // carries every field the helper needs (campaignId, amount,
      // onBehalfOf*, referrerAmplifierId).
      await this.awardDonationPoints(savedDonation, user.id);

      return savedDonation;
    } catch (err) {
      await qr.rollbackTransaction();
      this.logger.error(`Wallet donation failed for user ${user.id}`, err);
      throw err;
    } finally {
      await qr.release();
    }
  }

  private async initializePaystackDonation(
    campaign: Campaign,
    donateDto: DonateDto,
    user: User,
  ) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const txReference = `SBP-${uuidv4().replace(/-/g, '').substring(0, 16).toUpperCase()}`;

      const referrerAmplifierId = await this.resolveReferrerAmplifierId(
        donateDto.referrerCode,
        campaign.id,
      );

      const paystackRes = await this.paymentService.initiateTransactions({
        amount: donateDto.amount * 100,
        email: user?.email as string,
        reference: txReference,
        metadata: {
          type: 'CAMPAIGN_DONATION',
          campaignId: campaign.id,
          user_id: user.id,
          isAnonymous: donateDto.isAnonymous,
          customUsername: donateDto.username,
          onBehalfOf: donateDto.onBehalfOf,
          onBehalfOfUserId: donateDto.onBehalfOfUserId,
          onBehalfOfExternal: donateDto.onBehalfOfExternal,
          comment: donateDto.comment,
          referrerAmplifierId,
        },
      });

      await qr.manager.save(Transaction, {
        walletId: null,
        amount: donateDto.amount,
        currency: 'NGN',
        type: TransactionType.CAMPAIGN_DONATION,
        direction: TransactionDirection.CREDIT,
        status: TransactionStatus.PENDING,
        reference: txReference,
        gatewayReference: txReference,
        paymentGateway: 'paystack',
        description: `Campaign donation via Paystack — ${campaign.title}`,
        sourceRef: {
          entity: 'campaign',
          id: campaign.id,
        },
        metadata: { campaignId: campaign.id, userId: user.id },
      });

      await qr.commitTransaction();

      return {
        status: 'pending',
        paymentMethod: 'paystack',
        authorizationUrl: paystackRes.data.authorization_url,
        reference: txReference,
      };
    } catch (err) {
      await qr.rollbackTransaction();
      this.logger.error(`Wallet donation failed for user ${user.id}`, err);
      throw err;
    } finally {
      await qr.release();
    }
  }

  private triggerDonationEvents(
    campaign: Campaign,
    user: User,
    amount: number,
    isAnonymous: boolean,
    customUsername: string,
  ) {
    this.eventEmitter.emit('donation.receipt', {
      donorId: user.id,
      email: user.email,
      campaignName: campaign.title,
      campaignId: campaign.id,
      amount,
      pushToken: user.fcmToken,
    });

    this.eventEmitter.emit('donation.received', {
      creatorId: campaign.creatorId,
      campaignName: campaign.title,
      campaignId: campaign.id,
      amount,
      donorName: isAnonymous ? 'Anonymous' : customUsername || user.firstName,
      pushToken: campaign.creator?.fcmToken,
    });

    const newCurrentAmount = Number(campaign.currentAmount) + amount;
    const targetAmount = Number(campaign.target);

    if (targetAmount > 0) {
      const previousAmount = Number(campaign.currentAmount);
      const hit50 =
        previousAmount < targetAmount / 2 &&
        newCurrentAmount >= targetAmount / 2;
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
  }

  async getCampaignDonations(
    campaignId: string,
    paginationDto: PaginationDto,
  ): Promise<PaginatedResponse<DonationResponseDto>> {
    const { page, limit } = paginationDto;
    const skip = paginationDto.getSkip();

    const queryBuilder = this.donationRepository
      .createQueryBuilder('donation')
      // Join relations
      .leftJoinAndSelect('donation.donor', 'donor')
      .leftJoinAndSelect('donor.profile', 'donorProfile')
      .leftJoinAndSelect('donation.onBehalfOfUser', 'obUser')
      .leftJoinAndSelect('obUser.profile', 'obUserProfile')
      .where('donation.campaignId = :campaignId', { campaignId })
      .orderBy('donation.createdAt', 'DESC')
      // Pagination
      .skip(skip)
      .take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    return PaginationHelper.createResponse(
      data.map((donation) => this.mapToResponse(donation)),
      total,
      page ?? 1,
      limit ?? 10,
    );
  }

  async getTopDonors(campaignId: string, limit: number = 10): Promise<any> {
    // `donation.donorId IS NOT NULL` matches the criteria used by the
    // public Top-donor chip on the funding card
    // (see CampaignService.getTopDonor). Without it, donations missing
    // a linked donor would all collapse into a single GROUP BY donor.id
    // null bucket and surface as a phantom top row.
    //
    // `MIN(donation.isAnonymous)` is 1 iff *every* donation by this
    // donor on this campaign was flagged anonymous — in that case we
    // strip the name/avatar before returning so the leaderboard
    // honours the donor's privacy choice. A donor with even one
    // non-anonymous donation has effectively opted into being named.
    //
    // Pattern mirrors CampaignService.getTopDonor — raw column names,
    // explicit aliases, and every non-aggregated select column added
    // to GROUP BY so MySQL's ONLY_FULL_GROUP_BY mode accepts it.
    const rows = await this.donationRepository
      .createQueryBuilder('d')
      .leftJoin('users', 'u', 'u.id = d.donorId')
      .leftJoin('profiles', 'p', 'p.user_id = u.id')
      .select('d.donorId', 'donorId')
      .addSelect('u.first_name', 'firstName')
      .addSelect('u.last_name', 'lastName')
      .addSelect('u.username', 'username')
      .addSelect('p.image', 'profileImage')
      .addSelect('SUM(d.amount)', 'totalDonated')
      .addSelect('MIN(d.isAnonymous)', 'allAnonymous')
      .where('d.campaignId = :campaignId', { campaignId })
      .andWhere('d.donorId IS NOT NULL')
      .groupBy('d.donorId')
      .addGroupBy('u.first_name')
      .addGroupBy('u.last_name')
      .addGroupBy('u.username')
      .addGroupBy('p.image')
      .orderBy('totalDonated', 'DESC')
      .limit(limit)
      .getRawMany<{
        donorId: string;
        firstName: string | null;
        lastName: string | null;
        username: string | null;
        profileImage: string | null;
        totalDonated: string | null;
        allAnonymous: number | string | null;
      }>();

    return rows.map((r) => {
      const isAnonymous =
        r.allAnonymous === 1 ||
        r.allAnonymous === '1' ||
        (r.allAnonymous as unknown) === true;
      // Fall back to username when both first/last name are empty so
      // donors who signed up with only a handle still get a label
      // instead of a blank row.
      const composedName =
        [r.firstName, r.lastName]
          .filter((s): s is string => !!s && s.length > 0)
          .join(' ')
          .trim() ||
        r.username ||
        null;
      const [firstName, lastName] = composedName
        ? composedName.includes(' ')
          ? [
              composedName.slice(0, composedName.indexOf(' ')),
              composedName.slice(composedName.indexOf(' ') + 1),
            ]
          : [composedName, null]
        : [null, null];
      return {
        donor_id: r.donorId,
        donor_first_name: isAnonymous ? null : firstName,
        donor_last_name: isAnonymous ? null : lastName,
        profile_image: isAnonymous ? null : r.profileImage,
        isAnonymous,
        totalDonated: r.totalDonated,
      };
    });
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
