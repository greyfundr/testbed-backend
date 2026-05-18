import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner, In } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  SplitBillActivity,
  SplitBill,
  SplitBillParticipant,
  SplitBillComment,
  SplitBillLike,
} from '../entities';
import { Transaction } from '../../transaction/entities';
import {
  SplitMethod,
  SplitBillStatus,
  ParticipantStatus,
  ParticipantRole,
  ActivityActionType,
  MyBillsRole,
} from '../enums';
import {
  TransactionType,
  TransactionStatus,
  TransactionDirection,
  LedgerAccountType,
} from '../../transaction/enums/transaction.enum';
import { WalletService } from '../../wallet/services';
import { PendingPayoutService } from '../../wallet/services/pending-payout.service';
import { PendingPayout } from '../../wallet/entities/pending-payout.entity';
import {
  ShareAdjustment,
  ValidatedParticipant,
  ComputeSharesResult,
} from '../interfaces';
import {
  CreateSplitBillDto,
  UpdateSplitBillDto,
  AddParticipantDto,
  RemoveParticipantDto,
  PayBillShareDto,
  GuestPayBillShareDto,
  GetUserBillsDto,
  CancelBillDto,
  GetMyBillsDto,
  GetMyInvitesDto,
  BillPaymentMethod,
  AddSplitBillCommentDto,
  EditSplitBillCommentDto,
  BillQueryDto,
  CommentDisplayType,
} from '../dto/split-bill.dto';
import { UserRepository } from '../../user/repository';
import { TransactionRepository } from '../../transaction/repository';
import { PaymentService } from '../../payment/services';
import { Settings } from 'src/api/settings/entities';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DynamicLinkService } from 'src/api/dynamic-link/services/dynamic-link.service';
import { User, USER_SAFE_FIELDS } from 'src/api/user/entities';
import { TermiiService } from 'src/common/services/termii.service';
import { WhatsAppService } from 'src/common/services/whatsapp.service';
import { NotificationService } from 'src/api/notification/services/notification.service';

@Injectable()
export class SplitBillService {
  private readonly logger = new Logger(SplitBillService.name);

  constructor(
    @InjectRepository(SplitBill)
    private readonly billRepo: Repository<SplitBill>,
    @InjectRepository(SplitBillParticipant)
    private readonly participantRepo: Repository<SplitBillParticipant>,
    @InjectRepository(SplitBillActivity)
    private readonly activityRepo: Repository<SplitBillActivity>,
    @InjectRepository(SplitBillComment)
    private readonly commentRepo: Repository<SplitBillComment>,
    @InjectRepository(SplitBillLike)
    private readonly likeRepo: Repository<SplitBillLike>,
    private readonly userRepo: UserRepository,
    private readonly transactionRepo: TransactionRepository,
    private readonly walletService: WalletService,
    private readonly pendingPayoutService: PendingPayoutService,
    private readonly paymentService: PaymentService,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
    private readonly dynamicLinkService: DynamicLinkService,
    private readonly termiiService: TermiiService,
    private readonly whatsAppService: WhatsAppService,
    private readonly notificationService: NotificationService,
  ) {}

  // Fan out SMS + WhatsApp + in-app/push to a newly-added participant.
  // Fire-and-forget — wrapped in try/catch per channel so a delivery
  // hiccup on one provider doesn't block the API response or the other
  // channels. Only fires for participants with a phone (SMS/WhatsApp)
  // or a linked userId (in-app/push). Called after the addParticipant
  // transaction has committed so a failed send never rolls back the
  // participant row.
  private async fanOutParticipantAdded(input: {
    bill: SplitBill;
    participant: SplitBillParticipant;
    creatorName: string;
    shareAmount: number;
    isGuest: boolean;
  }): Promise<void> {
    const { bill, participant, creatorName, shareAmount, isGuest } = input;

    // Resolve phone: guests carry it on the participant row; USER
    // participants store it on their user record under phoneNumber.
    let phone: string | null = null;
    let displayName = 'there';
    if (isGuest) {
      phone = participant.guestPhone ?? null;
      displayName = participant.guestName ?? 'there';
    } else if (participant.userId) {
      const userRow = await this.userRepo.findOne({
        where: { id: participant.userId },
        select: ['id', 'phoneNumber', 'firstName', 'lastName'],
      });
      phone = userRow?.phoneNumber ?? null;
      displayName =
        `${userRow?.firstName ?? ''} ${userRow?.lastName ?? ''}`.trim() ||
        'there';
    }
    const guestName = displayName;
    const billTitle = bill.title ?? 'a split bill';
    const total = bill.totalAmount ?? 0;
    const currency = bill.currency ?? 'NGN';
    const link =
      bill.shareLink ?? `https://greyfundr.com/bills/${bill.id}`;
    const formatMoney = (n: number) =>
      `${currency === 'NGN' ? '₦' : ''}${Number(n).toLocaleString()}`;

    // ── SMS (short summary + link) ────────────────────────────
    if (phone) {
      const sms =
        `GreyFundr: ${creatorName} added you to "${billTitle}". ` +
        `Your share: ${formatMoney(shareAmount)}. View & pay: ${link}`;
      try {
        await this.termiiService.sendSMS(phone, sms);
      } catch (err) {
        this.logger.warn(
          `SMS to ${phone} failed for bill ${bill.id}: ${(err as Error).message}`,
        );
      }

      // ── WhatsApp (detailed body via Meta Graph API) ─────────
      const detail =
        `Hi ${guestName}, ${creatorName} added you to a split bill ` +
        `on GreyFundr.\n\n` +
        `Bill: ${billTitle}\n` +
        `Total: ${formatMoney(total)}\n` +
        `Your share: ${formatMoney(shareAmount)}\n` +
        `Participants: ${bill.participants?.length ?? 0}\n\n` +
        `View the bill, see everyone involved, and pay your share here:\n` +
        `${link}\n\n` +
        `Don't have the app? The link works in your browser.`;
      try {
        await this.whatsAppService.sendTemplate(phone, billTitle, detail);
      } catch (err) {
        this.logger.warn(
          `WhatsApp to ${phone} failed for bill ${bill.id}: ${(err as Error).message}`,
        );
      }
    }

    // ── In-app + push (USER participants only) ────────────────
    if (!isGuest && participant.userId) {
      try {
        await this.notificationService.notify(
          participant.userId,
          'billReminders',
          {
            title: 'Added to a split bill',
            message:
              `${creatorName} added you to "${billTitle}". ` +
              `Your share: ${formatMoney(shareAmount)}.`,
            type: 'split_bill',
            metadata: {
              kind: 'participant_added',
              billId: bill.id,
              participantId: participant.id,
              shareLink: link,
            },
          },
        );
      } catch (err) {
        this.logger.warn(
          `Push to user ${participant.userId} failed for bill ${bill.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  async createBill(
    creatorId: string,
    dto: CreateSplitBillDto,
  ): Promise<SplitBill> {
    if (dto.amount <= 0) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    const validated = await this.validateParticipants(
      dto.participants,
      dto.splitMethod,
    );

    if (validated.length === 0) {
      throw new BadRequestException('At least one participant is required');
    }

    this.assertSharesAreProvided(validated, dto.splitMethod, dto.amount);

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const newBill = qr.manager.create(SplitBill, {
        title: dto.title,
        description: dto.description ?? null,
        totalAmount: dto.amount,
        currency: dto.currency ?? 'NGN',
        creatorId,
        splitMethod: dto.splitMethod,
        status: SplitBillStatus.ACTIVE,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        imageUrl: dto.imageUrl ?? null,
        receipts: dto.receipts ?? null,
        allowPartialPayment: dto.allowPartialPayment ?? true,
        minPaymentAmount: dto.minPaymentAmount ?? null,
        totalParticipants: validated.length,
        totalCollected: 0,
        sourceBillType:
          (dto.sourceBillType as
            | 'invoice'
            | 'campaign'
            | 'request'
            | 'manual') ?? null,
        sourceBillId: dto.sourceBillId ?? null,
        recipientUserId: dto.recipientUserId ?? creatorId,
        isFinalized: false,
        offers: dto.offers ?? null,
      });

      const bill = await qr.manager.save(newBill);

      const participantRows = validated.map((p) => {
        const isCreator = p.userId === creatorId;

        return qr.manager.create(SplitBillParticipant, {
          splitBillId: bill.id,
          userId: p.userId ?? null,
          guestName: p.guestName ?? null,
          guestPhone: p.guestPhone ?? null,
          guestEmail: p.guestEmail ?? null,
          role: isCreator
            ? ParticipantRole.CREATOR
            : ParticipantRole.PARTICIPANT,
          status: isCreator
            ? ParticipantStatus.UNPAID
            : ParticipantStatus.INVITED,
          amountOwed: 0,
          amountPaid: 0,
          amountRemaining: 0,
          balanceAdjustment: 0,
          percentage: p.percentage ?? null,
          inviteCode: this.generateInviteCode(),
          inviteExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          invitedAt: new Date(),
          paymentMethod: null,
          walletId: null,
        });
      });

      await qr.manager.save(participantRows);

      await this.computeAndSaveShares(bill.id, validated, dto.splitMethod, qr);

      await this.logActivity(qr, {
        splitBillId: bill.id,
        actorId: creatorId,
        actionType: ActivityActionType.CREATED,
        description: `Bill "${dto.title}" created with ${validated.length} participants`,
        billStatusAtTime: SplitBillStatus.DRAFT,
        metadata: {
          totalAmount: dto.amount,
          splitMethod: dto.splitMethod,
          participantCount: validated.length,
        },
      });

      await qr.commitTransaction();

      const updatedParticipants = await this.participantRepo.find({
        where: { splitBillId: bill.id },
      });

      const creator = await this.userRepo.findOne({
        where: { id: creatorId },
        select: ['firstName', 'lastName'],
      });
      const creatorName =
        `${creator?.firstName ?? ''} ${creator?.lastName ?? ''}`.trim() ||
        'Someone';

      const userIds = updatedParticipants
        .filter((p) => p.userId && p.userId !== creatorId)
        .map((p) => p.userId);

      const userDetails =
        userIds.length > 0
          ? await this.userRepo.findAll({
              where: { id: In(userIds) },
              select: ['id', 'email', 'phoneNumber', 'fcmToken'],
            })
          : [];

      for (const pRow of updatedParticipants) {
        if (pRow.userId === creatorId) continue;

        if (pRow.userId) {
          const u = userDetails.find((detail) => detail.id === pRow.userId);
          if (!u) continue;

          const { shortUrl } = await this.dynamicLinkService.forSplitBill(
            bill.id,
            bill.title,
          );

          this.eventEmitter.emit('split_bill.participant_added', {
            userId: u.id,
            email: u.email,
            billTitle: bill.title,
            billId: bill.id,
            participantId: pRow.id,
            amountOwed: pRow.amountOwed,
            currency: bill.currency,
            creatorName: creatorName,
            phoneNumber: u.phoneNumber,
            pushToken: u.fcmToken,
            paymentLink: shortUrl,
          });
        } else if (pRow.guestPhone) {
          const { shortUrl } = await this.dynamicLinkService.forSplitBillInvite(
            bill.id,
            pRow.inviteCode as string,
            bill.title,
          );

          this.eventEmitter.emit('split_bill.guest_invited', {
            guestName: pRow.guestName || 'Friend',
            guestPhone: pRow.guestPhone,
            billTitle: bill.title,
            amountOwed: pRow.amountOwed,
            currency: bill.currency,
            creatorName: creatorName,
            paymentLink: shortUrl,
          });
        }
      }

      this.logger.log(`Split bill created: ${bill.id} by ${creatorId}`);
      return this.getBillById(bill.id, creatorId);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async getBillById(
    billId: string,
    requestingUserId?: string,
  ): Promise<SplitBill> {
    // Load the bill with the FULL participant roster (declined rows
    // included). Filtering declined participants here made the bill
    // disappear entirely whenever every participant declined — which
    // happens often when a creator bills others without adding
    // themselves. The creator needs to see declined rows so they can
    // re-invite, replace, or cancel.
    const bill = await this.billRepo.findOne({
      where: { id: billId },
      relations: [
        'participants',
        'participants.user',
        'participants.user.profile',
        'creator',
        'creator.profile',
        'comments',
      ],
    });

    if (!bill) throw new NotFoundException('Bill not found');

    const sanitizeUser = (user: User | null) => {
      if (!user) return null;
      const safeUser = {};
      USER_SAFE_FIELDS.forEach((field) => {
        safeUser[field] = user[field];
      });
      safeUser['image'] = user.profile?.image;
      return safeUser as User;
    };

    if (bill.creator) {
      bill.creator = sanitizeUser(bill.creator) as User;
    }

    if (bill.participants) {
      bill.participants = bill.participants.map((p) => ({
        ...p,
        user: sanitizeUser(p.user),
      })) as SplitBillParticipant[];
    }

    // Bolt on like state for the requester — kept off the entity so
    // we don't pollute the table mapping. Two cheap reads: a count
    // of all likes on this bill, and a one-row lookup for whether
    // the requester themselves has liked it. Skip the lookup if
    // there's no requester (e.g. unauthenticated guest path).
    const likesCount = await this.likeRepo.count({
      where: { splitBillId: billId },
    });
    let isLiked = false;
    if (requestingUserId) {
      const mine = await this.likeRepo.findOne({
        where: { splitBillId: billId, userId: requestingUserId },
      });
      isLiked = !!mine;
    }
    (bill as SplitBill & { likesCount: number; isLiked: boolean }).likesCount =
      likesCount;
    (bill as SplitBill & { likesCount: number; isLiked: boolean }).isLiked =
      isLiked;

    return bill;
  }

  // Toggle a like for the requesting user on this bill. Returns the
  // post-toggle state so the client can render the new heart + count
  // without a follow-up fetch. Idempotent at the row level — the
  // unique (split_bill_id, user_id) constraint guarantees no
  // duplicates if two taps race.
  async toggleLike(
    billId: string,
    userId: string,
  ): Promise<{ isLiked: boolean; likesCount: number }> {
    const bill = await this.billRepo.findOne({ where: { id: billId } });
    if (!bill) throw new NotFoundException('Bill not found');

    const existing = await this.likeRepo.findOne({
      where: { splitBillId: billId, userId },
    });

    if (existing) {
      await this.likeRepo.remove(existing);
    } else {
      try {
        await this.likeRepo.save(
          this.likeRepo.create({ splitBillId: billId, userId }),
        );
      } catch {
        // Race: a concurrent tap already inserted the like. Treat
        // as success — the caller's intent (be liked) is satisfied.
      }
    }

    const likesCount = await this.likeRepo.count({
      where: { splitBillId: billId },
    });
    const after = await this.likeRepo.findOne({
      where: { splitBillId: billId, userId },
    });
    return { isLiked: !!after, likesCount };
  }

  async getUserBills(
    userId: string,
    dto: GetUserBillsDto,
  ): Promise<{
    bills: any[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const { status, role = 'all', page = 1, limit = 20 } = dto;
    const offset = (page - 1) * limit;

    const buildBase = () =>
      this.billRepo
        .createQueryBuilder('bill')
        .leftJoinAndSelect('bill.participants', 'p')
        .leftJoin('p.user', 'pUser')
        .addSelect([
          'pUser.id',
          'pUser.firstName',
          'pUser.lastName',
          'pUser.email',
          'pUser.username',
          'pUser.accountType',
          'pUser.hasCompletedKyc',
        ])
        .orderBy('bill.createdAt', 'DESC')
        .skip(offset)
        .take(limit);

    let qb = buildBase();

    if (role === 'creator') {
      qb.where('bill.creatorId = :userId', { userId });
    } else if (role === 'participant') {
      qb.where(
        `EXISTS (
        SELECT 1 FROM split_bill_participants sp
        WHERE sp.split_bill_id = bill.id
          AND sp.user_id = :userId
          AND sp.deleted_at IS NULL
      )`,
        { userId },
      );
    } else {
      qb.where(
        `bill.creatorId = :userId OR EXISTS (
        SELECT 1 FROM split_bill_participants sp
        WHERE sp.split_bill_id = bill.id
          AND sp.user_id = :userId
          AND sp.deleted_at IS NULL
      )`,
        { userId },
      );
    }

    if (status) qb.andWhere('bill.status = :status', { status });

    const [bills, total] = await qb.getManyAndCount();

    const shaped = bills.map((bill) => ({
      ...bill,
      participants: bill.participants.map((p) => ({
        ...p,
        displayName:
          p.guestName ??
          (p.user
            ? `${p.user.firstName ?? ''} ${p.user.lastName ?? ''}`.trim() ||
              p.user.email
            : null) ??
          'Unknown',
      })),
    }));

    return { bills: shaped, total, page, totalPages: Math.ceil(total / limit) };
  }

  async updateBill(
    billId: string,
    actorId: string,
    dto: UpdateSplitBillDto,
  ): Promise<SplitBill> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const bill = await qr.manager.findOne(SplitBill, {
        where: { id: billId },
        relations: ['participants'],
        lock: { mode: 'pessimistic_write' },
      });

      if (!bill) throw new NotFoundException('Bill not found');
      if (bill.creatorId !== actorId)
        throw new ForbiddenException(
          'Only the bill creator can update this bill',
        );
      if (bill.isFinalized)
        throw new BadRequestException('Cannot update a finalized bill');
      if (
        [SplitBillStatus.SETTLED, SplitBillStatus.CANCELLED].includes(
          bill.status,
        )
      )
        throw new BadRequestException(`Cannot update a ${bill.status} bill`);

      const effectiveAmount = dto.amount ?? bill.totalAmount;
      const effectiveMethod = dto.splitMethod ?? bill.splitMethod;
      const amountChanging =
        dto.amount !== undefined && dto.amount !== bill.totalAmount;
      const methodChanging =
        dto.splitMethod !== undefined && dto.splitMethod !== bill.splitMethod;
      const participantsChanging = dto.participants !== undefined;

      const paidParticipants = bill.participants.filter(
        (p) => p.amountPaid > 0,
      );

      if (participantsChanging) {
        const incomingUserIds = new Set(
          dto.participants!.map((p) => p.userId).filter(Boolean),
        );
        const incomingPhones = new Set(
          dto.participants!.map((p) => p.phone).filter(Boolean),
        );

        for (const p of paidParticipants) {
          const stillPresent = p.userId
            ? incomingUserIds.has(p.userId)
            : incomingPhones.has(p.guestPhone!);

          if (!stillPresent) {
            throw new BadRequestException(
              `Cannot remove participant ${p.userId ?? p.guestPhone} — they have already made a payment of ₦${p.amountPaid}.`,
            );
          }
        }
      }

      if (paidParticipants.length > 0 && (amountChanging || methodChanging)) {
        const isManualReassignment =
          effectiveMethod === SplitMethod.MANUAL &&
          participantsChanging &&
          dto.participants!.every((p) => p.amount !== undefined);

        if (!isManualReassignment) {
          throw new BadRequestException(
            'Cannot change amount or split method after payments have been made ' +
              'unless you provide explicit manual amounts for all participants.',
          );
        }
      }

      const updateData: Partial<SplitBill> = {};
      if (dto.title !== undefined) updateData.title = dto.title;
      if (dto.description !== undefined)
        updateData.description = dto.description;
      if (dto.amount !== undefined) updateData.totalAmount = dto.amount;
      if (dto.splitMethod !== undefined)
        updateData.splitMethod = dto.splitMethod;
      if (dto.dueDate !== undefined) updateData.dueDate = new Date(dto.dueDate);
      if (dto.imageUrl !== undefined) updateData.imageUrl = dto.imageUrl;
      if (dto.coverImages !== undefined) {
        updateData.coverImages = dto.coverImages;
        // Mirror the first entry into imageUrl so legacy single-image
        // consumers (older clients, list shaping in getMyActiveBills)
        // see the new cover too. Empty array clears both.
        updateData.imageUrl = dto.coverImages.length > 0
          ? dto.coverImages[0]
          : null;
      }
      if (dto.receipts !== undefined) updateData.receipts = dto.receipts;
      if (dto.allowPartialPayment !== undefined)
        updateData.allowPartialPayment = dto.allowPartialPayment;
      if (dto.minPaymentAmount !== undefined)
        updateData.minPaymentAmount = dto.minPaymentAmount;
      if (dto.recipientUserId !== undefined)
        updateData.recipientUserId = dto.recipientUserId;
      if (dto.offers !== undefined) updateData.offers = dto.offers;

      if (Object.keys(updateData).length > 0) {
        await qr.manager.update(SplitBill, billId, updateData);
      }

      const brandNewUserIds: string[] = [];
      const brandNewGuests: {
        guestPhone: string;
        guestName: string;
      }[] = [];

      if (participantsChanging) {
        const currentParticipants = await qr.manager.find(
          SplitBillParticipant,
          {
            where: { splitBillId: billId },
          },
        );

        const incomingKeys = new Set(
          dto.participants!.map((p) =>
            p.userId ? `user:${p.userId}` : `guest:${p.phone}`,
          ),
        );

        const toRemove = currentParticipants.filter((p) => {
          const key = p.userId ? `user:${p.userId}` : `guest:${p.guestPhone}`;
          return !incomingKeys.has(key);
        });

        if (toRemove.length) {
          await qr.manager.softDelete(
            SplitBillParticipant,
            toRemove.map((p) => p.id),
          );
        }

        const mappedParticipants = dto.participants!.map((p) => ({
          type: p.type ?? (p.userId ? 'USER' : 'GUEST'),
          userId: p.userId,
          name: p.name,
          phone: p.phone,
          percentage: p.percentage,
          amount: p.amount,
        }));

        const validatedParticipants = await this.validateParticipants(
          mappedParticipants,
          effectiveMethod,
        );

        if (effectiveMethod === SplitMethod.MANUAL) {
          const totalAssigned = dto.participants!.reduce(
            (sum, p) => sum + (p.amount ?? 0),
            0,
          );

          if (Math.abs(totalAssigned - effectiveAmount) > 0.001) {
            throw new BadRequestException(
              `Manual split amounts must sum to ₦${effectiveAmount}. Got ₦${totalAssigned}.`,
            );
          }

          for (const p of dto.participants!) {
            const existing = currentParticipants.find((cp) =>
              p.userId ? cp.userId === p.userId : cp.guestPhone === p.phone,
            );

            const isNew = !existing;
            const amountOwed = p.amount!;
            const alreadyPaid = existing?.amountPaid ?? 0;
            const amountDue = Math.max(0, amountOwed - alreadyPaid);

            await qr.manager.upsert(
              SplitBillParticipant,
              {
                ...(existing ?? {}),
                splitBillId: billId,
                userId: p.userId ?? null,
                guestName: p.name ?? null,
                guestPhone: p.phone ?? null,
                percentage: null,
                role: existing?.role ?? ParticipantRole.PARTICIPANT,
                status: isNew
                  ? ParticipantStatus.INVITED
                  : (existing?.status ?? ParticipantStatus.INVITED),
                amountOwed,
                amountPaid: alreadyPaid,
                amountRemaining: amountDue,
                balanceAdjustment: existing?.balanceAdjustment ?? 0,
                inviteCode: existing?.inviteCode ?? this.generateInviteCode(),
                inviteExpiresAt:
                  existing?.inviteExpiresAt ??
                  new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                invitedAt: existing?.invitedAt ?? new Date(),
              },
              p.userId
                ? ['splitBillId', 'userId']
                : ['splitBillId', 'guestPhone'],
            );

            if (isNew) {
              if (p.userId) {
                brandNewUserIds.push(p.userId);
              } else if (p.phone) {
                brandNewGuests.push({
                  guestPhone: p.phone,
                  guestName: p.name ?? 'Friend',
                });
              }
            }
          }

          await qr.manager.update(SplitBill, billId, {
            totalParticipants: dto.participants!.length,
          });
        } else {
          for (const p of validatedParticipants) {
            const existingRow = currentParticipants.find((cp) =>
              p.userId
                ? cp.userId === p.userId
                : cp.guestPhone === p.guestPhone,
            );

            if (!existingRow) {
              await qr.manager.save(
                qr.manager.create(SplitBillParticipant, {
                  splitBillId: billId,
                  userId: p.userId ?? null,
                  guestName: p.guestName ?? null,
                  guestPhone: p.guestPhone ?? null,
                  guestEmail: p.guestEmail ?? null,
                  role: ParticipantRole.PARTICIPANT,
                  status: ParticipantStatus.INVITED,
                  amountOwed: 0,
                  amountPaid: 0,
                  amountRemaining: 0,
                  balanceAdjustment: 0,
                  percentage: p.percentage ?? null,
                  inviteCode: this.generateInviteCode(),
                  inviteExpiresAt: new Date(
                    Date.now() + 7 * 24 * 60 * 60 * 1000,
                  ),
                  invitedAt: new Date(),
                  paymentMethod: null,
                  walletId: null,
                }),
              );

              if (p.userId) {
                brandNewUserIds.push(p.userId);
              } else if (p.guestPhone) {
                brandNewGuests.push({
                  guestPhone: p.guestPhone,
                  guestName: p.guestName ?? 'Friend',
                });
              }
            } else if (
              p.percentage !== undefined &&
              effectiveMethod === SplitMethod.PERCENTAGE
            ) {
              await qr.manager.update(SplitBillParticipant, existingRow.id, {
                percentage: p.percentage,
              });
            }
          }

          await qr.manager.update(SplitBill, billId, {
            totalParticipants: validatedParticipants.length,
          });

          await this.computeAndSaveShares(
            billId,
            validatedParticipants,
            effectiveMethod,
            qr,
            effectiveAmount,
          );
        }
      } else if (amountChanging || methodChanging) {
        if (effectiveMethod === SplitMethod.MANUAL) {
          throw new BadRequestException(
            'Cannot auto-recalculate a MANUAL split when changing amount or method. Provide an explicit participants list with amounts.',
          );
        }

        const currentParticipants = await qr.manager.find(
          SplitBillParticipant,
          {
            where: { splitBillId: billId },
          },
        );

        const participantInputs = currentParticipants.map((p) => ({
          type: p.userId ? 'USER' : 'GUEST',
          userId: p.userId ?? undefined,
          guestName: p.guestName ?? undefined,
          guestPhone: p.guestPhone ?? undefined,
          percentage: p.percentage ?? undefined,
        }));

        await this.computeAndSaveShares(
          billId,
          participantInputs as any,
          effectiveMethod,
          qr,
          effectiveAmount,
        );
      }

      await this.logActivity(qr, {
        splitBillId: billId,
        actorId,
        actionType: ActivityActionType.UPDATED,
        description: 'Bill details updated',
        billStatusAtTime: bill.status,
        metadata: {
          updatedFields: [
            ...Object.keys(updateData),
            ...(participantsChanging ? ['participants'] : []),
          ],
        },
      });

      await qr.commitTransaction();

      if (brandNewUserIds.length > 0 || brandNewGuests.length > 0) {
        try {
          const creator = await this.userRepo.findOne({
            where: { id: actorId },
            select: ['firstName', 'lastName', 'email'],
          });
          const creatorName = creator
            ? `${creator.firstName ?? ''} ${creator.lastName ?? ''}`.trim() ||
              creator.email
            : 'Someone';

          const finalParticipants = await this.participantRepo.find({
            where: { splitBillId: billId },
          });

          if (brandNewUserIds.length > 0) {
            const newUserDetails = await this.userRepo.findAll({
              where: { id: In(brandNewUserIds) },
              select: ['id', 'email', 'phoneNumber', 'fcmToken'],
            });

            for (const u of newUserDetails) {
              const pRow = finalParticipants.find((p) => p.userId === u.id);
              if (!pRow) continue;

              const { shortUrl } = await this.dynamicLinkService.forSplitBill(
                bill.id,
                bill.title,
              );

              this.eventEmitter.emit('split_bill.participant_added', {
                userId: u.id,
                email: u.email,
                billTitle: bill.title,
                billId: bill.id,
                participantId: pRow.id,
                amountOwed: pRow.amountOwed,
                currency: bill.currency,
                creatorName,
                phoneNumber: u.phoneNumber,
                pushToken: u.fcmToken,
                paymentLink: shortUrl,
              });
            }
          }

          for (const guest of brandNewGuests) {
            const pRow = finalParticipants.find(
              (p) => p.guestPhone === guest.guestPhone,
            );
            if (!pRow) continue;

            const { shortUrl } =
              await this.dynamicLinkService.forSplitBillInvite(
                bill.id,
                pRow.inviteCode as string,
                bill.title,
              );

            this.eventEmitter.emit('split_bill.guest_invited', {
              guestName: guest.guestName,
              guestPhone: guest.guestPhone,
              billTitle: bill.title,
              amountOwed: pRow.amountOwed,
              currency: bill.currency,
              creatorName,
              paymentLink: shortUrl,
            });
          }
        } catch (notificationErr) {
          console.error(
            'Bill updated successfully but notifications failed:',
            notificationErr,
          );
        }
      }

      return this.getBillById(billId, actorId);
    } catch (err) {
      console.log('error', err);
      if (qr.isTransactionActive) {
        await qr.rollbackTransaction();
      }
      throw err;
    } finally {
      await qr.release();
    }
  }

  async getMyInvites(
    userId: string,
    dto: GetMyInvitesDto,
  ): Promise<{
    invites: any[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const { page = 1, limit = 20 } = dto;
    const offset = (page - 1) * limit;

    const [participants, total] = await this.participantRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.splitBill', 'bill')
      .leftJoin('bill.creator', 'creator')
      .addSelect([
        'creator.id',
        'creator.firstName',
        'creator.lastName',
        'creator.email',
        'creator.username',
      ])
      .where('p.userId = :userId', { userId })
      .andWhere('p.status = :status', { status: ParticipantStatus.INVITED })
      .andWhere('p.deletedAt IS NULL')
      .andWhere('(p.inviteExpiresAt IS NULL OR p.inviteExpiresAt > :now)', {
        now: new Date(),
      })
      .andWhere('bill.status NOT IN (:...excludedStatuses)', {
        excludedStatuses: [SplitBillStatus.CANCELLED, SplitBillStatus.SETTLED],
      })
      .orderBy('p.invitedAt', 'DESC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    const invites = participants.map((p) => ({
      participantId: p.id,
      inviteCode: p.inviteCode,
      inviteExpiresAt: p.inviteExpiresAt,
      invitedAt: p.invitedAt,
      amountOwed: p.amountOwed,
      percentage: p.percentage,
      currency: p.splitBill.currency,
      splitMethod: p.splitBill.splitMethod,
      bill: {
        id: p.splitBill.id,
        title: p.splitBill.title,
        description: p.splitBill.description,
        imageUrl: p.splitBill.imageUrl,
        totalAmount: p.splitBill.totalAmount,
        totalParticipants: p.splitBill.totalParticipants,
        currency: p.splitBill.currency,
        splitMethod: p.splitBill.splitMethod,
        status: p.splitBill.status,
        dueDate: p.splitBill.dueDate,
        shareLink: p.splitBill.shareLink,
        createdAt: p.splitBill.createdAt,
      },
      createdBy: p.splitBill.creator
        ? {
            id: p.splitBill.creator.id,
            name:
              `${p.splitBill.creator.firstName ?? ''} ${p.splitBill.creator.lastName ?? ''}`.trim() ||
              p.splitBill.creator.email,
            username: p.splitBill.creator.username,
          }
        : null,
    }));

    return { invites, total, page, totalPages: Math.ceil(total / limit) };
  }

  async getMyActiveBills(
    userId: string,
    dto: GetMyBillsDto,
  ): Promise<{
    bills: any[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const { status, role, page = 1, limit = 20 } = dto;
    const offset = (page - 1) * limit;

    const qb = this.billRepo
      .createQueryBuilder('bill')
      .leftJoinAndSelect(
        'bill.participants',
        'myPart',
        'myPart.userId = :userId AND myPart.deletedAt IS NULL',
        { userId },
      )
      .leftJoinAndSelect('bill.creator', 'creator')
      .where(
        `(bill.creatorId = :userId OR (
          myPart.userId = :userId AND 
          myPart.status NOT IN (:...ignoredStatuses)
        ))`,
        {
          userId,
          ignoredStatuses: [
            ParticipantStatus.DECLINED,
            ParticipantStatus.INVITED,
          ],
        },
      );

    if (status) {
      qb.andWhere('bill.status = :status', { status });
    }

    if (role === MyBillsRole.CREATOR) {
      qb.andWhere('bill.creatorId = :userId', { userId });
    } else if (role === MyBillsRole.PARTICIPANT) {
      qb.andWhere('bill.creatorId != :userId', { userId });
    }

    const [bills, total] = await qb
      .orderBy('bill.createdAt', 'DESC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    const shaped = bills.map((bill) => {
      const isCreator = bill.creatorId === userId;
      const myParticipant = bill.participants?.[0] ?? null;

      return {
        id: bill.id,
        title: bill.title,
        description: bill.description,
        imageUrl: bill.imageUrl,
        receipts: bill.receipts,
        totalAmount: bill.totalAmount,
        totalCollected: bill.totalCollected,
        remainingAmount: bill.totalAmount - bill.totalCollected,
        fundingPercentage:
          bill.totalAmount > 0
            ? Math.floor((bill.totalCollected / bill.totalAmount) * 100)
            : 0,
        currency: bill.currency,
        splitMethod: bill.splitMethod,
        status: bill.status,
        dueDate: bill.dueDate,
        totalParticipants: bill.totalParticipants,
        totalPaidParticipants: bill.totalPaidParticipants,
        isFinalized: bill.isFinalized,
        shareLink: bill.shareLink,
        createdAt: bill.createdAt,
        createdBy: bill.creator
          ? {
              id: bill.creator.id,
              name:
                `${bill.creator.firstName ?? ''} ${bill.creator.lastName ?? ''}`.trim() ||
                bill.creator.email,
              username: bill.creator.username,
            }
          : null,
        myRole: isCreator ? 'creator' : 'participant',
        allowPartialPayment: bill.allowPartialPayment,
        minPaymentAmount: bill.minPaymentAmount,
        myShare: myParticipant
          ? {
              participantId: myParticipant.id,
              role: myParticipant.role,
              status: myParticipant.status,
              amountOwed: myParticipant.amountOwed,
              amountPaid: myParticipant.amountPaid,
              amountRemaining: myParticipant.amountRemaining,
              percentage: myParticipant.percentage,
              inviteCode: myParticipant.inviteCode,
              paymentLink: myParticipant.paymentLink,
              acceptedAt: myParticipant.acceptedAt,
              fullyPaidAt: myParticipant.fullyPaidAt,
            }
          : null,
      };
    });

    return {
      bills: shaped,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async acceptBillInvite(billId: string, userId: string): Promise<void> {
    const participant = await this.participantRepo.findOne({
      where: {
        splitBillId: billId,
        userId,
      },
      relations: ['splitBill'],
    });

    if (!participant) {
      throw new NotFoundException('You have not been invited to this bill');
    }

    if (participant.status === ParticipantStatus.ACCEPTED) {
      throw new BadRequestException('You have already accepted this invite');
    }

    if (participant.status === ParticipantStatus.DECLINED) {
      throw new BadRequestException(
        'You have already declined this invite. Contact the creator to be re-invited.',
      );
    }

    if (participant.status !== ParticipantStatus.INVITED) {
      throw new BadRequestException('This invite is no longer pending');
    }

    if (
      participant.inviteExpiresAt &&
      participant.inviteExpiresAt < new Date()
    ) {
      throw new BadRequestException(
        'This invite has expired. Ask the bill creator to re-invite you.',
      );
    }

    await this.participantRepo.update(participant.id, {
      status: ParticipantStatus.ACCEPTED,
      acceptedAt: new Date(),
    });

    await this.activityRepo.save({
      splitBillId: billId,
      actorId: userId,
      actionType: ActivityActionType.PARTICIPANT_ACCEPTED,
      participantId: participant.id,
      description: 'Participant accepted invite',
      billStatusAtTime: participant.splitBill.status,
    });

    const acceptingUser = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'firstName', 'lastName', 'email'],
    });

    this.eventEmitter.emit('split_bill.participant_accepted', {
      creatorId: participant.splitBill.creatorId,
      participantName: acceptingUser
        ? `${acceptingUser.firstName ?? ''} ${acceptingUser.lastName ?? ''}`.trim() ||
          acceptingUser.email
        : 'A participant',
      billTitle: participant.splitBill.title,
      billId,
    });
  }

  async declineBillInvite(billId: string, userId: string): Promise<void> {
    const participant = await this.participantRepo.findOne({
      where: {
        splitBillId: billId,
        userId,
      },
      relations: ['splitBill'],
    });

    if (!participant) {
      throw new NotFoundException('You have not been invited to this bill');
    }

    if (participant.status === ParticipantStatus.DECLINED) {
      throw new BadRequestException('You have already declined this invite');
    }

    if (participant.status === ParticipantStatus.ACCEPTED) {
      throw new BadRequestException(
        'You have already accepted this invite. Contact the creator if you wish to be removed.',
      );
    }

    if (participant.amountPaid > 0) {
      throw new BadRequestException(
        'Cannot decline after making a payment. Contact the creator.',
      );
    }

    await this.participantRepo.update(participant.id, {
      status: ParticipantStatus.DECLINED,
      declinedAt: new Date(),
    });

    await this.activityRepo.save({
      splitBillId: billId,
      actorId: userId,
      actionType: ActivityActionType.PARTICIPANT_DECLINED,
      participantId: participant.id,
      description: 'Participant declined invite',
      billStatusAtTime: participant.splitBill.status,
    });

    const decliningUser = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'firstName', 'lastName', 'email'],
    });

    this.eventEmitter.emit('split_bill.participant_declined', {
      creatorId: participant.splitBill.creatorId,
      participantName: decliningUser
        ? `${decliningUser.firstName ?? ''} ${decliningUser.lastName ?? ''}`.trim() ||
          decliningUser.email
        : 'A participant',
      billTitle: participant.splitBill.title,
      billId,
    });
  }

  async addParticipant(
    billId: string,
    actorId: string,
    dto: AddParticipantDto,
  ): Promise<{
    participant: SplitBillParticipant;
    adjustments: ShareAdjustment[];
  }> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const bill = await qr.manager.findOne(SplitBill, {
        where: { id: billId },
        relations: ['participants'],
        lock: { mode: 'pessimistic_write' },
      });

      if (!bill) throw new NotFoundException('Bill not found');
      if (bill.creatorId !== actorId)
        throw new ForbiddenException('Only the creator can add participants');
      if (bill.isFinalized)
        throw new BadRequestException(
          'Cannot add participant to a finalized bill',
        );

      if (
        [
          SplitBillStatus.SETTLED,
          SplitBillStatus.CANCELLED,
          SplitBillStatus.FUNDED,
        ].includes(bill.status)
      ) {
        throw new BadRequestException(
          `Cannot add participant to a ${bill.status} bill`,
        );
      }

      if (dto.type === 'USER') {
        if (!dto.userId)
          throw new BadRequestException(
            'userId is required for USER participant',
          );

        const user = await this.userRepo.findOne({
          where: { id: dto.userId },
          select: ['id'],
          relations: ['settings'],
        });
        if (!user) throw new NotFoundException(`User ${dto.userId} not found`);

        if (user.settings && !user.settings.allowSplitBillInvites) {
          throw new ForbiddenException(
            'This user has disabled split bill invites. You cannot add them.',
          );
        }

        const alreadyIn = bill.participants.some(
          (p) => p.userId === dto.userId,
        );
        if (alreadyIn)
          throw new ConflictException(
            'User is already a participant in this bill',
          );
      } else {
        if (!dto.phone)
          throw new BadRequestException(
            'phone is required for GUEST participant',
          );
        if (!dto.name)
          throw new BadRequestException(
            'name is required for GUEST participant',
          );

        const alreadyIn = bill.participants.some(
          (p) => !p.userId && p.guestPhone === dto.phone,
        );
        if (alreadyIn)
          throw new ConflictException(
            'Guest with this phone is already in this bill',
          );
      }

      // ── Method-specific validation ────────────────────────────────────────
      let newParticipantAmount = 0;
      let newParticipantPercentage: number | null = null;

      if (bill.splitMethod === SplitMethod.MANUAL) {
        if (!dto.amount || dto.amount <= 0) {
          throw new BadRequestException(
            'amount (Naira) is required when adding to a MANUAL split bill',
          );
        }
        newParticipantAmount = dto.amount;

        const currentAllocated = bill.participants.reduce(
          (s, p) => s + p.amountOwed,
          0,
        );
        const remaining = bill.totalAmount - currentAllocated;

        if (newParticipantAmount > remaining) {
          if (!dto.redistribution?.length) {
            throw new BadRequestException(
              `Only ${remaining} Naira unallocated. ` +
                `Provide redistribution to make room for the new participant's ${newParticipantAmount} Naira share.`,
            );
          }
          await this.applyManualRedistribution(
            bill,
            dto.redistribution,
            bill.totalAmount - newParticipantAmount,
            qr,
          );
        }
      } else if (bill.splitMethod === SplitMethod.PERCENTAGE) {
        if (!dto.percentage || dto.percentage <= 0 || dto.percentage > 100) {
          throw new BadRequestException(
            'percentage (1-100) is required when adding to a PERCENTAGE split bill',
          );
        }
        newParticipantPercentage = dto.percentage;

        const currentPct = bill.participants.reduce(
          (s, p) => s + (p.percentage ?? 0),
          0,
        );
        if (currentPct + dto.percentage > 100) {
          if (!dto.redistribution?.length) {
            throw new BadRequestException(
              `Percentages would exceed 100% (${currentPct} + ${dto.percentage}). ` +
                `Provide redistribution to reduce existing participants' percentages.`,
            );
          }
          await this.applyPercentageRedistribution(
            bill,
            dto.redistribution,
            100 - dto.percentage,
            qr,
          );
        }
      }

      // ── Create participant ────────────────────────────────────────────────
      const newParticipant = await qr.manager.save(SplitBillParticipant, {
        splitBillId: billId,
        userId: dto.type === 'USER' ? dto.userId : null,
        guestName: dto.type === 'GUEST' ? dto.name : null,
        guestPhone: dto.type === 'GUEST' ? dto.phone : null,
        guestEmail: dto.email ?? null,
        role: ParticipantRole.PARTICIPANT,
        status: ParticipantStatus.INVITED,
        amountOwed: newParticipantAmount,
        amountPaid: 0,
        amountRemaining: newParticipantAmount,
        balanceAdjustment: 0,
        percentage: newParticipantPercentage,
        inviteCode: this.generateInviteCode(),
        inviteExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        invitedAt: new Date(),
        paymentMethod: null,
        walletId: null,
      });

      // ── Recompute EVEN shares ──────────────────────────────────────────────
      let adjustments: ShareAdjustment[] = [];

      if (bill.splitMethod === SplitMethod.EVEN) {
        const allParticipants: ValidatedParticipant[] = [
          ...bill.participants.map((p) => ({
            type: (p.userId ? 'USER' : 'GUEST') as 'USER' | 'GUEST',
            userId: p.userId ?? undefined,
            guestName: p.guestName ?? undefined,
            guestPhone: p.guestPhone ?? undefined,
          })),
          {
            type: dto.type,
            userId: dto.userId,
            guestName: dto.name,
            guestPhone: dto.phone,
          },
        ];
        const result = await this.computeAndSaveShares(
          billId,
          allParticipants,
          SplitMethod.EVEN,
          qr,
        );
        adjustments = result.adjustments;
      } else if (bill.splitMethod === SplitMethod.PERCENTAGE) {
        // Recompute amounts from percentages
        const allParticipants = await qr.manager.find(SplitBillParticipant, {
          where: { splitBillId: billId },
        });
        const result = await this.computeAndSaveShares(
          billId,
          allParticipants.map((p) => ({
            type: (p.userId ? 'USER' : 'GUEST') as 'USER' | 'GUEST',
            userId: p.userId ?? undefined,
            percentage: p.percentage ?? 0,
          })),
          SplitMethod.PERCENTAGE,
          qr,
        );
        adjustments = result.adjustments;
      }

      // ── Update participant count ────────────────────────────────────────────
      await qr.manager.increment(
        SplitBill,
        { id: billId },
        'totalParticipants',
        1,
      );

      await this.logActivity(qr, {
        splitBillId: billId,
        actorId,
        actionType: ActivityActionType.PARTICIPANT_ADDED,
        participantId: newParticipant.id,
        description: `Participant added: ${dto.name ?? dto.userId}`,
        billStatusAtTime: bill.status,
        metadata: {
          type: dto.type,
          splitMethod: bill.splitMethod,
          amountOwed: newParticipantAmount,
          percentage: newParticipantPercentage,
          adjustments,
        },
      });

      await qr.commitTransaction();

      const creator = await this.userRepo.findOne({
        where: { id: actorId },
        select: ['firstName', 'lastName', 'email'],
      });
      const creatorName = creator
        ? `${creator.firstName ?? ''} ${creator.lastName ?? ''}`.trim() ||
          (creator.email ?? 'Someone')
        : 'Someone';

      if (dto.type === 'USER' && dto.userId) {
        const targetUser = await this.userRepo.findOne({
          where: { id: dto.userId },
          select: ['id', 'email', 'firstName', 'lastName'],
        });

        if (targetUser) {
          this.eventEmitter.emit('split_bill.participant_added', {
            userId: targetUser.id,
            email: targetUser.email,
            billTitle: bill.title,
            billId: bill.id,
            participantId: newParticipant.id,
            amountOwed: newParticipantAmount,
            currency: bill.currency,
            creatorName,
          });
        }
      }

      // SMS + WhatsApp + push notification fan-out — fire-and-forget.
      // Termii + the Meta Graph WhatsApp API can each take several
      // seconds; awaiting them sequentially would push the API
      // response past the Dio client's 15s timeout, making the
      // frontend treat a successful add as a failure. We intentionally
      // do NOT await this Promise so the participant returns to the
      // caller immediately; delivery errors are logged by the helper.
      void this.fanOutParticipantAdded({
        bill,
        participant: newParticipant,
        creatorName,
        shareAmount: newParticipantAmount,
        isGuest: dto.type !== 'USER',
      }).catch((err) => {
        this.logger.warn(
          `Participant-added fan-out failed for bill ${bill.id}: ${(err as Error).message}`,
        );
      });

      return { participant: newParticipant, adjustments };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async removeParticipant(
    billId: string,
    participantId: string,
    actorId: string,
    dto: RemoveParticipantDto,
  ): Promise<{ adjustments: ShareAdjustment[] }> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const bill = await qr.manager.findOne(SplitBill, {
        where: { id: billId },
        relations: ['participants'],
        lock: { mode: 'pessimistic_write' },
      });

      if (!bill) throw new NotFoundException('Bill not found');
      if (bill.creatorId !== actorId)
        throw new ForbiddenException(
          'Only the creator can remove participants',
        );
      if (bill.isFinalized)
        throw new BadRequestException(
          'Cannot remove participant from a finalized bill',
        );

      if (
        [SplitBillStatus.SETTLED, SplitBillStatus.CANCELLED].includes(
          bill.status,
        )
      ) {
        throw new BadRequestException(
          `Cannot remove participant from a ${bill.status} bill`,
        );
      }

      const participant = bill.participants.find((p) => p.id === participantId);
      if (!participant)
        throw new NotFoundException('Participant not found in this bill');

      if (bill.participants.length <= 1) {
        throw new BadRequestException('Cannot remove the last participant');
      }

      if (participant.amountPaid > 0) {
        throw new BadRequestException(
          `Cannot remove a participant who has paid ₦${participant.amountPaid}. Process a refund first.`,
        );
      }

      // ── Method-specific redistribution ───────────────────────────────────
      const remaining = bill.participants.filter((p) => p.id !== participantId);

      if (
        bill.splitMethod === SplitMethod.MANUAL &&
        participant.amountOwed > 0
      ) {
        if (!dto.redistribution?.length) {
          throw new BadRequestException(
            `Participant has ₦${participant.amountOwed} allocated. ` +
              `Provide redistribution for the ${remaining.length} remaining participants.`,
          );
        }
        await this.applyManualRedistribution(
          bill,
          dto.redistribution,
          bill.totalAmount,
          qr,
          remaining.map((p) => p.id),
        );
      }

      if (
        bill.splitMethod === SplitMethod.PERCENTAGE &&
        (participant.percentage ?? 0) > 0
      ) {
        if (!dto.redistribution?.length) {
          throw new BadRequestException(
            `Participant has ${participant.percentage}% allocated. ` +
              `Provide redistribution for the ${remaining.length} remaining participants.`,
          );
        }
        await this.applyPercentageRedistribution(
          bill,
          dto.redistribution,
          100,
          qr,
          remaining.map((p) => p.id),
        );
      }

      // ── Soft delete the participant ───────────────────────────────────────
      await qr.manager.softDelete(SplitBillParticipant, participantId);

      // ── Recompute EVEN shares ──────────────────────────────────────────────
      let adjustments: ShareAdjustment[] = [];

      if (bill.splitMethod === SplitMethod.EVEN) {
        const participantInputs: ValidatedParticipant[] = remaining.map(
          (p) => ({
            type: (p.userId ? 'USER' : 'GUEST') as 'USER' | 'GUEST',
            userId: p.userId ?? undefined,
            guestName: p.guestName ?? undefined,
            guestPhone: p.guestPhone ?? undefined,
          }),
        );
        const result = await this.computeAndSaveShares(
          billId,
          participantInputs,
          SplitMethod.EVEN,
          qr,
        );
        adjustments = result.adjustments;
      }

      await qr.manager.decrement(
        SplitBill,
        { id: billId },
        'totalParticipants',
        1,
      );

      await this.logActivity(qr, {
        splitBillId: billId,
        actorId,
        actionType: ActivityActionType.PARTICIPANT_REMOVED,
        participantId,
        description: `Participant removed: ${participant.guestName ?? participant.userId}`,
        billStatusAtTime: bill.status,
        metadata: {
          amountOwed: participant.amountOwed,
          percentage: participant.percentage,
          redistributed: !!dto.redistribution?.length,
          adjustments,
        },
      });

      await qr.commitTransaction();

      return { adjustments };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async payBillShare(
    billId: string,
    payerParticipantId: string,
    payerId: string,
    dto: PayBillShareDto,
  ): Promise<any> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const payerParticipant = await qr.manager.findOne(SplitBillParticipant, {
        where: { id: payerParticipantId, splitBillId: billId },
        relations: ['user'],
        lock: { mode: 'pessimistic_write' },
      });

      if (!payerParticipant) {
        throw new NotFoundException('You are not a participant on this bill');
      }

      if (payerParticipant.userId !== payerId) {
        throw new ForbiddenException(
          'You can only make payments from your own account',
        );
      }

      const targetIds = Array.from(
        new Set([payerParticipantId, ...(dto.onBehalfOfParticipantIds || [])]),
      );

      const allParticipants = await qr.manager.find(SplitBillParticipant, {
        where: { id: In(targetIds), splitBillId: billId },
        lock: { mode: 'pessimistic_write' },
      });

      let totalRemainingDebt = 0;
      const debtMap = new Map<string, number>();

      for (const p of allParticipants) {
        if (p.status === ParticipantStatus.DECLINED) continue;
        const owed = p.amountOwed + p.balanceAdjustment;
        const remaining = Math.max(0, owed - p.amountPaid);
        debtMap.set(p.id, remaining);
        totalRemainingDebt += remaining;
      }

      if (dto.amount > totalRemainingDebt) {
        throw new BadRequestException(
          `Payment of ₦${dto.amount} exceeds the combined debt (₦${totalRemainingDebt}) of selected participants.`,
        );
      }

      const bill = await qr.manager.findOne(SplitBill, {
        where: { id: billId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!bill) throw new NotFoundException('Bill not found');

      if (
        [SplitBillStatus.CANCELLED, SplitBillStatus.SETTLED].includes(
          bill.status,
        )
      ) {
        throw new BadRequestException(`Cannot pay into a ${bill.status} bill`);
      }

      if (dto.paymentMethod === BillPaymentMethod.WALLET) {
        if (!dto.transactionPin) {
          throw new BadRequestException(
            'Transaction PIN is required for wallet payments',
          );
        }

        await this.walletService.verifyTransactionPin(
          payerId,
          dto.transactionPin,
        );
        const wallet = await this.walletService.getWalletByUserId(payerId);

        if (wallet.availableBalance < dto.amount) {
          throw new BadRequestException('Insufficient wallet balance');
        }

        const txReference = `SB-${uuidv4().replace(/-/g, '').substring(0, 20).toUpperCase()}`;

        const tx = await qr.manager.save(Transaction, {
          walletId: wallet.id,
          amount: dto.amount,
          currency: bill.currency,
          type: TransactionType.SPLIT_BILL_PAYMENT,
          direction: TransactionDirection.DEBIT,
          status: TransactionStatus.COMPLETED,
          reference: txReference,
          paymentGateway: 'wallet',
          description:
            dto.onBehalfOfParticipantIds &&
            dto.onBehalfOfParticipantIds.length > 0
              ? `Split bill payment for self and others — ${bill.title}`
              : `Split bill payment — ${bill.title}`,
          metadata: {
            billId,
            paidByUserId: payerId,
            onBehalfOfParticipantIds: dto.onBehalfOfParticipantIds,
          },
        });

        await this.walletService.lockIntoEscrow({
          walletId: wallet.id,
          amount: dto.amount,
          transactionId: tx.id,
          entityType: 'split_bill',
          entityId: billId,
          description: `Escrow for split bill "${bill.title}"`,
          qr,
        });

        const sortedParticipants = allParticipants.sort((a, b) => {
          if (a.id === payerParticipantId) return -1;
          if (b.id === payerParticipantId) return 1;
          return 0;
        });

        let amountLeftToDistribute = dto.amount;

        for (const p of sortedParticipants) {
          if (amountLeftToDistribute <= 0) break;

          const debt = debtMap.get(p.id) || 0;
          if (debt <= 0) continue;

          const paymentForThisParticipant = Math.min(
            amountLeftToDistribute,
            debt,
          );
          const newAmountPaid = p.amountPaid + paymentForThisParticipant;
          const totalOwed = p.amountOwed + p.balanceAdjustment;
          const isFullyPaid = newAmountPaid >= totalOwed;

          await qr.manager.update(SplitBillParticipant, p.id, {
            amountPaid: newAmountPaid,
            amountRemaining: Math.max(0, totalOwed - newAmountPaid),
            status: isFullyPaid
              ? ParticipantStatus.PAID
              : ParticipantStatus.PARTIAL,
            fullyPaidAt: isFullyPaid ? new Date() : null,
            firstPaidAt: p.firstPaidAt ?? new Date(),
          });

          amountLeftToDistribute -= paymentForThisParticipant;
        }

        const newTotalCollected = bill.totalCollected + dto.amount;
        await qr.manager.update(SplitBill, billId, {
          totalCollected: newTotalCollected,
          status:
            newTotalCollected >= bill.totalAmount
              ? SplitBillStatus.FUNDED
              : SplitBillStatus.PARTIALLY_PAID,
        });

        await this.logActivity(qr, {
          splitBillId: billId,
          actorId: payerId,
          actionType: ActivityActionType.PAYMENT_MADE,
          participantId: payerParticipantId,
          description: `₦${dto.amount} paid by ${payerId}`,
          amountDifference: dto.amount,
          billStatusAtTime: bill.status,
          transactionId: tx.id,
        });

        if (dto.comment?.trim()) {
          const resolvedDisplayName = await this.resolveDisplayName(
            payerParticipant,
            dto.commentDisplayType ?? 'full_name',
          );
          await qr.manager.save(
            qr.manager.create(SplitBillComment, {
              splitBillId: billId,
              participantId: payerParticipantId,
              authorId: payerId,
              displayName: resolvedDisplayName,
              content: dto.comment.trim(),
              transactionId: tx.id,
            }),
          );
        }

        await qr.commitTransaction();

        const freshBill = await this.billRepo.findOne({
          where: { id: billId },
          relations: ['participants'],
        });

        this.eventEmitter.emit('split_bill.updated', {
          billId: billId,
          type: 'UPDATE',
          data: freshBill,
        });

        if (freshBill) {
          this.emitPaymentReceivedEvent(
            freshBill,
            payerId,
            dto.amount,
            freshBill.totalCollected,
          );
        }

        return {
          status: 'success',
          amountPaid: dto.amount,
          billFullyFunded: newTotalCollected >= bill.totalAmount,
        };
      } else if (dto.paymentMethod === BillPaymentMethod.PAYSTACK) {
        const txReference = `SBP-${uuidv4().replace(/-/g, '').substring(0, 16).toUpperCase()}`;

        const paystackRes = await this.paymentService.initiateTransactions({
          amount: dto.amount * 100,
          email: payerParticipant.user?.email as string,
          reference: txReference,
          metadata: {
            type: 'USER_BILL_PAYMENT',
            split_bill_id: billId,
            target_participant_ids: targetIds,
            paid_by_participant_id: payerParticipantId,
            user_id: payerId,
            is_on_behalf:
              !!dto.onBehalfOfParticipantIds &&
              dto.onBehalfOfParticipantIds.length > 0,
          },
        });

        await qr.manager.save(Transaction, {
          amount: dto.amount,
          currency: bill.currency,
          type: TransactionType.SPLIT_BILL_PAYMENT,
          direction: TransactionDirection.CREDIT,
          status: TransactionStatus.PENDING,
          reference: txReference,
          paymentGateway: 'paystack',
          description: `Split bill payment via Paystack — ${bill.title}`,
        });

        await qr.commitTransaction();

        return {
          status: 'pending',
          authorizationUrl: paystackRes.data.authorization_url,
          reference: txReference,
        };
      }
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  private async resolveDisplayName(
    participant: SplitBillParticipant,
    displayType: CommentDisplayType,
  ): Promise<string> {
    if (participant.isGuest) {
      return participant.guestName ?? 'Guest';
    }

    if (!participant.user && participant.userId) {
      const user = await this.userRepo.findOne({
        where: { id: participant.userId },
        select: ['firstName', 'lastName', 'username', 'email'],
      });
      if (displayType === 'anonymous') return 'Anonymous';
      if (displayType === 'username')
        return user?.username ?? user?.email ?? 'Unknown';
      return (
        `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() ||
        user?.email ||
        'Unknown'
      );
    }

    if (displayType === 'anonymous') return 'Anonymous';
    if (displayType === 'username') {
      return (
        participant.user?.username ??
        `${participant.user?.firstName ?? ''} ${participant.user?.lastName ?? ''}`.trim() ??
        'Unknown'
      );
    }
    return (
      `${participant.user?.firstName ?? ''} ${participant.user?.lastName ?? ''}`.trim() ||
      participant.user?.email ||
      'Unknown'
    );
  }

  private async emitPaymentReceivedEvent(
    bill: SplitBill,
    payerId: string,
    amount: number,
    newTotalCollected: number,
  ) {
    const payerUser = await this.userRepo.findOne({
      where: { id: payerId },
      select: ['firstName', 'lastName', 'email'],
    });
    const creatorUser = await this.userRepo.findOne({
      where: { id: bill.creatorId },
      select: ['phoneNumber', 'fcmToken'],
    });

    this.eventEmitter.emit('split_bill.payment_received', {
      creatorId: bill.creatorId,
      participantName: payerUser
        ? `${payerUser.firstName ?? ''} ${payerUser.lastName ?? ''}`.trim() ||
          payerUser.email
        : 'A participant',
      billTitle: bill.title,
      billId: bill.id,
      amount: amount,
      currency: bill.currency,
      totalCollected: newTotalCollected,
      totalAmount: bill.totalAmount,
      phoneNumber: creatorUser?.phoneNumber,
      pushToken: creatorUser?.fcmToken,
    });
  }

  async guestPayBillShare(
    billId: string,
    participantId: string,
    dto: GuestPayBillShareDto,
  ): Promise<{ participantFullyPaid: boolean; billFullyFunded: boolean }> {
    const { status, amount, paid_at, channel } =
      await this.paymentService.verifyTransaction(dto.gatewayReference);

    if (status !== 'success') {
      throw new BadRequestException(
        `Payment was not successful. Status: ${status}`,
      );
    }

    const verifiedAmount = amount / 100; // Paystack returns kobo

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const existingTx = await qr.manager.findOne(Transaction, {
        where: { gatewayReference: dto.gatewayReference },
      });
      if (existingTx) {
        throw new ConflictException(
          `Payment reference ${dto.gatewayReference} already processed`,
        );
      }

      const participant = await qr.manager.findOne(SplitBillParticipant, {
        where: { id: participantId, splitBillId: billId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!participant) throw new NotFoundException('Participant not found');

      const bill = await qr.manager.findOne(SplitBill, {
        where: { id: billId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!bill) throw new NotFoundException('Bill not found');
      if (['cancelled', 'settled', 'funded'].includes(bill.status)) {
        throw new BadRequestException(`Cannot pay into a ${bill.status} bill`);
      }

      const tx = await qr.manager.save(Transaction, {
        walletId: null, // Guests don't have wallets
        amount: verifiedAmount,
        currency: bill.currency,
        type: TransactionType.SPLIT_BILL_PAYMENT,
        direction: TransactionDirection.CREDIT,
        status: TransactionStatus.COMPLETED,
        reference: dto.gatewayReference,
        gatewayReference: dto.gatewayReference,
        paymentGateway: 'paystack',
        description: `Guest payment — ${bill.title}`,
        sourceRef: { entity: 'split_bill', id: billId },
        confirmedAt: new Date(paid_at),
        metadata: {
          participantId: participant.id,
          guestName: participant.guestName,
          channel,
        },
      });

      const effectiveOwed =
        participant.amountOwed + participant.balanceAdjustment;
      const newAmountPaid = participant.amountPaid + verifiedAmount;
      const newAmountRemaining = Math.max(0, effectiveOwed - newAmountPaid);
      const participantFullyPaid = newAmountRemaining === 0;

      // 4. Update Participant
      await qr.manager.update(SplitBillParticipant, participantId, {
        amountPaid: newAmountPaid,
        amountRemaining: newAmountRemaining,
        status: participantFullyPaid
          ? ParticipantStatus.PAID
          : ParticipantStatus.PARTIAL,
        paymentMethod: channel === 'card' ? 'card' : 'bank_transfer',
        firstPaidAt: participant.firstPaidAt ?? new Date(),
        fullyPaidAt: participantFullyPaid ? new Date() : null,
      });

      const newTotalCollected = bill.totalCollected + verifiedAmount;
      const billFullyFunded = newTotalCollected >= bill.totalAmount;

      await qr.manager.update(SplitBill, billId, {
        totalCollected: newTotalCollected,
        ...(participantFullyPaid && {
          totalPaidParticipants: () => 'total_paid_participants + 1',
        }),
        status: billFullyFunded
          ? SplitBillStatus.FUNDED
          : SplitBillStatus.PARTIALLY_PAID,
      });

      await this.logActivity(qr, {
        splitBillId: billId,
        actorId: null,
        actionType: ActivityActionType.PAYMENT_MADE,
        participantId,
        description: `Guest payment of ₦${verifiedAmount} verified`,
        amountBefore: participant.amountPaid,
        amountAfter: newAmountPaid,
        amountDifference: verifiedAmount,
        billStatusAtTime: bill.status,
        transactionId: tx.id,
      });

      await qr.commitTransaction();

      return { participantFullyPaid, billFullyFunded };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async generateGuestPaymentLink(
    billId: string,
    participantId: string,
  ): Promise<string> {
    const participant = await this.participantRepo.findOne({
      where: { id: participantId, splitBillId: billId },
      relations: ['splitBill'],
    });

    if (!participant) throw new NotFoundException('Participant not found');
    if (participant.isFullyPaid) {
      throw new BadRequestException(
        'This participant has already paid in full.',
      );
    }
    if (!participant.isGuest) {
      throw new BadRequestException('Registered users must pay via wallet.');
    }

    if (
      participant.paymentLink &&
      participant.paymentLinkExpiresAt &&
      participant.paymentLinkExpiresAt.getTime() > Date.now() + 5 * 60 * 1000
    ) {
      return participant.paymentLink;
    }

    const email =
      participant.guestEmail || `guest-${participant.id}@greyfundr.com`;
    const reference = `SBG-${uuidv4().replace(/-/g, '').substring(0, 15).toUpperCase()}`;
    const amountToPay = participant.amountRemaining; // Already in kobo

    const { data } = await this.paymentService.initiateTransactions({
      email,
      amount: Math.round(amountToPay * 100), // Paystack needs kobo
      reference,
      metadata: {
        split_bill_id: billId,
        participant_id: participantId,
        type: 'GUEST_BILL_PAYMENT',
      },
    });

    participant.paymentLink = data.authorization_url;
    participant.paymentLinkExpiresAt = new Date(
      Date.now() + 24 * 60 * 60 * 1000,
    );
    await this.participantRepo.save(participant);

    return data.authorization_url;
  }

  async finalizeBill(billId: string, actorId: string): Promise<SplitBill> {
    const bill = await this.billRepo.findOne({
      where: { id: billId },
      relations: ['participants'],
    });

    if (!bill) throw new NotFoundException('Bill not found');
    if (bill.creatorId !== actorId)
      throw new ForbiddenException('Only the creator can finalize this bill');
    if (bill.isFinalized)
      throw new BadRequestException('Bill is already finalized');

    if (
      [SplitBillStatus.CANCELLED, SplitBillStatus.SETTLED].includes(bill.status)
    ) {
      throw new BadRequestException(`Cannot finalize a ${bill.status} bill`);
    }

    await this.billRepo.update(billId, {
      isFinalized: true,
      finalizedAt: new Date(),
      status: SplitBillStatus.ACTIVE,
    });

    await this.activityRepo.save({
      splitBillId: billId,
      actorId,
      actionType: ActivityActionType.BILL_FINALIZED,
      description:
        'Bill finalized — no further changes to participants or amounts',
      billStatusAtTime: SplitBillStatus.ACTIVE,
    });

    return this.getBillById(billId, actorId);
  }

  // Cancelling a bill with collected funds triggers an automatic refund
  // pass per participant. Registered users get an immediate wallet credit.
  // Guests (no userId, just a phone) get a PendingPayout row + SMS +
  // WhatsApp invite to sign up — the row is consumed the moment they
  // verify the same phone. Refund funds are debited from the bill
  // creator's wallet (project decision 2026-05-17 — creator absorbs the
  // Paystack fee since collected money may be split across wallet payers
  // and Paystack, but the refund obligation is uniformly the creator's).
  async cancelBill(
    billId: string,
    actorId: string,
    dto: CancelBillDto,
  ): Promise<SplitBill> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    // Captured inside the transaction, fired after commit so a
    // notification failure can never roll back a real refund.
    const guestPayoutsToNotify: { id: string }[] = [];

    try {
      const bill = await qr.manager.findOne(SplitBill, {
        where: { id: billId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!bill) throw new NotFoundException('Bill not found');
      if (bill.creatorId !== actorId)
        throw new ForbiddenException('Only the creator can cancel this bill');
      if (bill.status === SplitBillStatus.CANCELLED)
        throw new BadRequestException('Bill is already cancelled');
      if (bill.status === SplitBillStatus.SETTLED)
        throw new BadRequestException('Cannot cancel a settled bill');

      // Snapshot every paid participant under a row lock so a concurrent
      // payment can't slip in between our refund decision and commit.
      const paidParticipants = await qr.manager.find(SplitBillParticipant, {
        where: { splitBillId: billId },
        lock: { mode: 'pessimistic_write' },
      });
      const refundables = paidParticipants.filter((p) => p.amountPaid > 0);

      const totalRefund = refundables.reduce(
        (sum, p) => sum + Number(p.amountPaid),
        0,
      );

      if (totalRefund > 0) {
        // Pre-check creator wallet — surface a clean 422 instead of
        // hitting debitWallet's generic insufficient-balance error and
        // doing N partial credits first.
        const creatorWallet = await this.walletService.getWalletByUserId(
          bill.creatorId,
        );
        if (creatorWallet.availableBalance < totalRefund) {
          throw new BadRequestException(
            `Insufficient wallet balance to refund participants. ` +
              `Required: ₦${totalRefund.toLocaleString('en-NG')}, ` +
              `Available: ₦${Number(creatorWallet.availableBalance).toLocaleString('en-NG')}. ` +
              `Top up your wallet, then cancel the bill.`,
          );
        }

        // Debit creator wallet once for the full refund. A single ledger
        // entry on the creator side keeps reconciliation simple — the
        // per-participant detail is in metadata and on each credit.
        const debitTx = await qr.manager.save(Transaction, {
          walletId: creatorWallet.id,
          userId: bill.creatorId,
          amount: totalRefund,
          currency: bill.currency,
          type: TransactionType.REVERSAL,
          direction: TransactionDirection.DEBIT,
          status: TransactionStatus.COMPLETED,
          reference: `SB-CANCEL-${uuidv4().replace(/-/g, '').substring(0, 18).toUpperCase()}`,
          description: `Refund disbursement for cancelled bill "${bill.title}"`,
          sourceRef: { entity: 'split_bill', id: billId },
          metadata: {
            billId,
            participantCount: refundables.length,
            kind: 'split_bill_cancel_refund_debit',
          },
        });

        await this.walletService.debitWallet({
          walletId: creatorWallet.id,
          amount: totalRefund,
          transactionId: debitTx.id,
          targetAccountType: LedgerAccountType.BILL_ESCROW,
          targetEntityId: billId,
          description: `Refund disbursement for cancelled bill "${bill.title}"`,
          qr,
        });

        // Credit each participant. Registered users land in-wallet
        // immediately; guests get a parked PendingPayout that the
        // signup flow will consume.
        for (const p of refundables) {
          const amount = Number(p.amountPaid);
          if (p.userId) {
            const recipientWallet = await this.walletService.getWalletByUserId(
              p.userId,
            );
            const creditTx = await qr.manager.save(Transaction, {
              walletId: recipientWallet.id,
              userId: p.userId,
              amount,
              currency: bill.currency,
              type: TransactionType.REVERSAL,
              direction: TransactionDirection.CREDIT,
              status: TransactionStatus.COMPLETED,
              reference: `SB-REFUND-${uuidv4().replace(/-/g, '').substring(0, 16).toUpperCase()}`,
              description: `Refund from cancelled bill "${bill.title}"`,
              sourceRef: { entity: 'split_bill', id: billId },
              metadata: {
                billId,
                participantId: p.id,
                kind: 'split_bill_cancel_refund_credit',
              },
            });
            await this.walletService.creditWallet({
              walletId: recipientWallet.id,
              amount,
              transactionId: creditTx.id,
              sourceAccountType: LedgerAccountType.BILL_ESCROW,
              sourceEntityId: billId,
              description: `Refund from cancelled bill "${bill.title}"`,
              qr,
            });
          } else if (p.guestPhone) {
            const payout = await this.pendingPayoutService.createForGuestCancel(
              {
                phone: p.guestPhone,
                amount,
                billId,
                participantId: p.id,
                originPayerUserId: null,
                billCreatorUserId: bill.creatorId,
                qr,
              },
            );
            guestPayoutsToNotify.push({ id: payout.id });
          }
          // If a participant has neither userId nor guestPhone, there is
          // no-one to refund — log it and move on; the creator's debit
          // already excluded these because we filter on amountPaid > 0
          // and a row without identity can't have paid.
        }
      }

      await qr.manager.update(SplitBill, billId, {
        status: SplitBillStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: dto.reason ?? null,
      });

      await this.logActivity(qr, {
        splitBillId: billId,
        actorId,
        actionType: ActivityActionType.CANCELLED,
        description: dto.reason ?? 'Bill cancelled by creator',
        billStatusAtTime: SplitBillStatus.CANCELLED,
        metadata: {
          reason: dto.reason,
          totalRefunded: totalRefund,
          refundedParticipants: refundables.length,
          guestPayouts: guestPayoutsToNotify.length,
        },
      });

      await qr.commitTransaction();

      // Out-of-band: notify guest payout recipients. Errors are
      // swallowed inside notify(); never let a delivery hiccup poison
      // a successful refund.
      for (const ref of guestPayoutsToNotify) {
        const fresh = await this.dataSource.manager.findOne(PendingPayout, {
          where: { id: ref.id },
        });
        if (fresh) {
          this.pendingPayoutService.notify(fresh).catch((err) => {
            this.logger.warn(
              `[cancelBill] notify failed for payout ${ref.id}: ${(err as Error)?.message}`,
            );
          });
        }
      }

      this.eventEmitter.emit('split_bill.updated', {
        billId,
        type: 'CANCEL',
      });

      return this.getBillById(billId, actorId);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async acceptInvite(
    inviteCode: string,
    userId: string,
  ): Promise<SplitBillParticipant> {
    const participant = await this.participantRepo.findOne({
      where: { inviteCode },
      relations: ['splitBill'],
    });

    if (!participant) throw new NotFoundException('Invalid invite code');

    if (
      participant.inviteExpiresAt &&
      participant.inviteExpiresAt < new Date()
    ) {
      throw new BadRequestException('Invite code has expired');
    }

    if (participant.acceptedAt) {
      throw new ConflictException('Invite already accepted');
    }

    if (participant.declinedAt) {
      throw new BadRequestException('You previously declined this invite');
    }

    // If participant was a guest, link them to the registered user account
    await this.participantRepo.update(participant.id, {
      userId: participant.userId ?? userId,
      status: ParticipantStatus.ACCEPTED,
      acceptedAt: new Date(),
    });

    await this.activityRepo.save({
      splitBillId: participant.splitBillId,
      actorId: userId,
      actionType: ActivityActionType.PARTICIPANT_ACCEPTED,
      participantId: participant.id,
      description: 'Participant accepted invite',
      billStatusAtTime: participant.splitBill.status,
    });

    const updatedParticipant = await this.participantRepo.findOne({
      where: { id: participant.id },
      relations: ['splitBill'],
    });

    if (!updatedParticipant) {
      throw new NotFoundException('Participant not found after update');
    }

    const bill = await this.billRepo.findOne({
      where: { id: participant.splitBillId },
      relations: ['creator'],
      select: {
        id: true,
        title: true,
        creatorId: true,
        creator: {
          firstName: true,
          lastName: true,
          fcmToken: true,
        },
      },
    });

    const acceptingUser = await this.userRepo.findOne({
      where: { id: userId },
      select: ['firstName', 'lastName', 'email'],
    });

    if (bill) {
      this.eventEmitter.emit('split_bill.participant_accepted', {
        creatorId: bill.creatorId,
        participantName: acceptingUser
          ? `${acceptingUser.firstName ?? ''} ${acceptingUser.lastName ?? ''}`.trim() ||
            acceptingUser.email
          : 'A participant',
        billTitle: bill.title,
        billId: bill.id,
        pushToken: bill.creator?.fcmToken,
      });
    }

    return updatedParticipant;
  }

  async declineInvite(inviteCode: string, userId: string): Promise<void> {
    const participant = await this.participantRepo.findOne({
      where: { inviteCode },
    });

    if (!participant) throw new NotFoundException('Invalid invite code');
    if (participant.amountPaid > 0) {
      throw new BadRequestException('Cannot decline after making a payment');
    }

    await this.participantRepo.update(participant.id, {
      status: ParticipantStatus.DECLINED,
      declinedAt: new Date(),
    });

    await this.activityRepo.save({
      splitBillId: participant.splitBillId,
      actorId: userId,
      actionType: ActivityActionType.PARTICIPANT_DECLINED,
      participantId: participant.id,
      description: 'Participant declined invite',
    });

    const bill = await this.billRepo.findOne({
      where: { id: participant.splitBillId },
      relations: ['creator'],
      select: {
        id: true,
        title: true,
        creatorId: true,
        creator: {
          firstName: true,
          lastName: true,
          fcmToken: true,
        },
      },
    });

    const decliningUser = await this.userRepo.findOne({
      where: { id: userId },
      select: ['firstName', 'lastName', 'email'],
    });

    if (bill) {
      this.eventEmitter.emit('split_bill.participant_declined', {
        creatorId: bill.creatorId,
        participantName: decliningUser
          ? `${decliningUser.firstName ?? ''} ${decliningUser.lastName ?? ''}`.trim() ||
            decliningUser.email
          : 'A participant',
        billTitle: bill.title,
        billId: bill.id,
        pushToken: bill.creator?.fcmToken,
      });
    }
  }

  async getParticipantStatus(participantId: string, requestingUserId: string) {
    const participant = await this.participantRepo.findOne({
      where: { id: participantId },
      relations: ['splitBill'],
    });

    if (!participant) throw new NotFoundException('Participant not found');

    // Access: the participant themselves, or the bill creator
    const canAccess =
      participant.userId === requestingUserId ||
      participant.splitBill.creatorId === requestingUserId;

    if (!canAccess) throw new ForbiddenException('Access denied');

    // Fetch payment history from Transaction table via sourceRef
    const payments = await this.transactionRepo
      .createQueryBuilder('tx')
      .where(`tx.source_ref->>'entity' = 'split_bill'`)
      .andWhere(`tx.source_ref->>'participantId' = :participantId`, {
        participantId,
      })
      .andWhere('tx.status = :status', { status: TransactionStatus.COMPLETED })
      .orderBy('tx.createdAt', 'DESC')
      .getMany();

    const effectiveOwed =
      participant.amountOwed + participant.balanceAdjustment;

    return {
      participant: {
        id: participant.id,
        userId: participant.userId,
        guestName: participant.guestName,
        guestPhone: participant.guestPhone,
        role: participant.role,
        status: participant.status,
        amountOwed: participant.amountOwed,
        balanceAdjustment: participant.balanceAdjustment,
        effectiveOwed,
        amountPaid: participant.amountPaid,
        amountRemaining: participant.amountRemaining,
        percentage: participant.percentage,
        inviteCode: participant.inviteCode,
        acceptedAt: participant.acceptedAt,
        fullyPaidAt: participant.fullyPaidAt,
      },
      bill: {
        id: participant.splitBill.id,
        title: participant.splitBill.title,
        totalAmount: participant.splitBill.totalAmount,
        totalCollected: participant.splitBill.totalCollected,
        currency: participant.splitBill.currency,
        status: participant.splitBill.status,
        dueDate: participant.splitBill.dueDate,
      },
      payments: payments.map((tx) => ({
        id: tx.id,
        amount: tx.amount,
        currency: tx.currency,
        paymentMethod: tx.metadata?.paymentMethod ?? 'wallet',
        gatewayReference: tx.gatewayReference,
        confirmedAt: tx.confirmedAt,
        createdAt: tx.createdAt,
      })),
    };
  }

  async sendReminders(
    billId: string,
    actorId: string,
  ): Promise<{ count: number }> {
    const bill = await this.billRepo.findOne({
      where: { id: billId },
      relations: ['participants', 'participants.user'],
    });

    if (!bill) throw new NotFoundException('Bill not found');
    if (bill.creatorId !== actorId)
      throw new ForbiddenException('Only the creator can send reminders');

    if (
      [SplitBillStatus.CANCELLED, SplitBillStatus.SETTLED].includes(bill.status)
    ) {
      throw new BadRequestException(
        `Cannot send reminders for a ${bill.status} bill`,
      );
    }

    const unpaidParticipants = bill.participants.filter(
      (p) => p.status !== ParticipantStatus.PAID,
    );

    if (unpaidParticipants.length === 0) {
      return { count: 0 };
    }

    const creator = await this.userRepo.findOne({
      where: { id: actorId },
      select: ['firstName', 'lastName'],
    });
    const creatorName =
      `${creator?.firstName ?? ''} ${creator?.lastName ?? ''}`.trim() ||
      'Someone';

    await this.billRepo.update(billId, {
      reminderSentCount: () => 'reminder_sent_count + 1',
      lastReminderAt: new Date(),
    });

    for (const p of unpaidParticipants) {
      await this.participantRepo.update(p.id, {
        reminderCount: () => 'reminder_count + 1',
        lastRemindedAt: new Date(),
      });

      if (p.userId && p.user) {
        const { shortUrl } = await this.dynamicLinkService.forSplitBill(
          bill.id,
          bill.title,
        );

        this.eventEmitter.emit('split_bill.reminder.user', {
          userId: p.userId,
          email: p.user.email,
          phoneNumber: p.user.phoneNumber,
          pushToken: p.user.fcmToken,
          billTitle: bill.title,
          amountRemaining: p.amountRemaining,
          currency: bill.currency || 'NGN',
          creatorName,
          paymentLink: shortUrl,
        });
      } else if (p.guestPhone) {
        const { shortUrl } = await this.dynamicLinkService.forSplitBillInvite(
          bill.id,
          p.inviteCode as string,
          bill.title,
        );

        this.eventEmitter.emit('split_bill.reminder.guest', {
          guestName: p.guestName || 'Friend',
          guestPhone: p.guestPhone,
          billTitle: bill.title,
          amountRemaining: p.amountRemaining,
          currency: bill.currency || 'NGN',
          creatorName,
          paymentLink: shortUrl,
        });
      }
    }

    await this.activityRepo.save({
      splitBillId: billId,
      actorId,
      actionType: ActivityActionType.REMINDER_SENT,
      description: `Reminders sent to ${unpaidParticipants.length} participants`,
      metadata: {
        count: unpaidParticipants.length,
        participantIds: unpaidParticipants.map((p) => p.id),
      },
    });

    return { count: unpaidParticipants.length };
  }

  async getBillActivity(
    billId: string,
    requestingUserId: string,
    page = 1,
    limit = 50,
  ) {
    const bill = await this.billRepo.findOne({
      where: { id: billId },
      relations: ['participants'],
    });

    if (!bill) throw new NotFoundException('Bill not found');

    const hasAccess =
      bill.creatorId === requestingUserId ||
      bill.participants.some((p) => p.userId === requestingUserId);

    if (!hasAccess) throw new ForbiddenException('Access denied');

    const [activities, total] = await this.activityRepo.findAndCount({
      where: { splitBillId: billId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { activities, total, page, totalPages: Math.ceil(total / limit) };
  }

  async addComment(
    billId: string,
    participantId: string,
    dto: AddSplitBillCommentDto,
  ): Promise<SplitBillComment> {
    const participant = await this.participantRepo.findOne({
      where: { id: participantId, splitBillId: billId },
      relations: ['splitBill', 'splitBill.creator', 'user'],
    });

    if (!participant) {
      throw new NotFoundException('Participant not found on this bill');
    }

    if (participant.status === ParticipantStatus.DECLINED) {
      throw new ForbiddenException(
        'You declined this bill and cannot comment on it',
      );
    }

    if (participant.splitBill.status === SplitBillStatus.CANCELLED) {
      throw new BadRequestException('Cannot comment on a cancelled bill');
    }

    let displayName: string;
    let displayType: SplitBillComment['displayType'];

    if (participant.isGuest) {
      displayName = participant.guestName ?? 'Guest';
      displayType = 'guest';
    } else if (dto.displayType === 'anonymous') {
      displayName = 'Anonymous';
      displayType = 'anonymous';
    } else if (dto.displayType === 'username') {
      displayName =
        participant.user?.username ??
        `${participant.user?.firstName ?? ''} ${participant.user?.lastName ?? ''}`.trim() ??
        'Unknown';
      displayType = 'username';
    } else {
      displayName =
        `${participant.user?.firstName ?? ''} ${participant.user?.lastName ?? ''}`.trim() ||
        participant.user?.email ||
        'Unknown';
      displayType = 'full_name';
    }

    const saved = await this.commentRepo.save(
      this.commentRepo.create({
        splitBillId: billId,
        participantId: participant.id,
        authorId: participant.userId,
        guestPhone: participant.guestPhone ?? null,
        displayName,
        displayType,
        content: dto.content.trim(),
        isPinned: false,
        isEdited: false,
      }),
    );

    // Notify the bill creator (skip when they comment on their own bill).
    // Mirrors the campaign comment notification — socialInteractions channel.
    const bill = participant.splitBill;
    if (bill && bill.creatorId && bill.creatorId !== participant.userId) {
      try {
        await this.notificationService.notify(
          bill.creatorId,
          'socialInteractions',
          {
            title: 'New Comment',
            message: `${displayName} commented on your bill: ${bill.title}`,
            type: 'BILL_COMMENT',
            metadata: {
              billId,
              authorId: participant.userId,
              participantId: participant.id,
              commentId: saved.id,
              pushToken: bill.creator?.fcmToken,
            },
          },
        );
      } catch (err) {
        this.logger.warn(
          `Comment notify failed for bill ${billId}: ${(err as Error).message}`,
        );
      }
    }

    return saved;
  }

  async editComment(
    commentId: string,
    participantId: string,
    dto: EditSplitBillCommentDto,
  ): Promise<SplitBillComment> {
    const comment = await this.commentRepo.findOne({
      where: { id: commentId },
    });

    if (!comment || comment.deletedAt) {
      throw new NotFoundException('Comment not found');
    }

    if (comment.participantId !== participantId) {
      throw new ForbiddenException('You can only edit your own comments');
    }

    await this.commentRepo.update(commentId, {
      content: dto.content.trim(),
      isEdited: true,
      editedAt: new Date(),
    });

    return this.commentRepo.findOne({
      where: { id: commentId },
    }) as Promise<SplitBillComment>;
  }

  async deleteComment(commentId: string, participantId: string): Promise<void> {
    const comment = await this.commentRepo.findOne({
      where: { id: commentId },
      relations: ['splitBill'],
    });

    if (!comment || comment.deletedAt) {
      throw new NotFoundException('Comment not found');
    }

    const isAuthor = comment.participantId === participantId;

    let isCreator = false;
    if (!isAuthor) {
      const requestingParticipant = await this.participantRepo.findOne({
        where: { id: participantId },
      });
      isCreator = comment.splitBill.creatorId === requestingParticipant?.userId;
    }

    if (!isAuthor && !isCreator) {
      throw new ForbiddenException(
        'You can only delete your own comments, or moderate as the bill creator',
      );
    }

    await this.commentRepo.softDelete(commentId);
  }

  async getBillComments(
    billId: string,
    page = 1,
    limit = 50,
  ): Promise<{
    comments: any[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const [raw, total] = await this.commentRepo
      .createQueryBuilder('c')
      .where('c.splitBillId = :billId', { billId })
      .andWhere('c.deletedAt IS NULL')
      .orderBy('c.isPinned', 'DESC')
      .addOrderBy('c.createdAt', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const comments = raw.map((c) => ({
      id: c.id,
      content: c.content,
      displayName: c.displayName,
      displayType: c.displayType,
      participantId: c.participantId,
      authorId: c.authorId,
      isGuest: c.authorId === null,
      isPinned: c.isPinned,
      isEdited: c.isEdited,
      editedAt: c.editedAt,
      transactionId: c.transactionId,
      createdAt: c.createdAt,
    }));

    return { comments, total, page, totalPages: Math.ceil(total / limit) };
  }

  async queryBill(
    billId: string,
    userId: string,
    dto: BillQueryDto,
  ): Promise<void> {
    const participant = await this.participantRepo.findOne({
      where: { splitBillId: billId, userId },
      relations: ['splitBill', 'splitBill.creator'],
      select: {
        id: true,
        userId: true,
        amountOwed: true,
        status: true,
        splitBill: {
          id: true,
          title: true,
          creatorId: true,
          currency: true,
          creator: {
            firstName: true,
            lastName: true,
            fcmToken: true,
          },
        },
      },
    });

    if (!participant) {
      throw new NotFoundException('You are not a participant on this bill');
    }

    if (participant.status === ParticipantStatus.DECLINED) {
      throw new BadRequestException(
        'You have declined this bill. You cannot query it.',
      );
    }

    if (participant.status === ParticipantStatus.PAID) {
      throw new BadRequestException(
        'Your share is already paid. Use the comment section for queries.',
      );
    }

    const bill = participant.splitBill;

    await this.activityRepo.save({
      splitBillId: billId,
      actorId: userId,
      actionType: ActivityActionType.QUERY_RAISED,
      participantId: participant.id,
      description: dto.message,
      billStatusAtTime: bill.status,
      metadata: {
        participantStatus: participant.status,
        amountOwed: participant.amountOwed,
        currency: bill.currency,
      },
    });

    const queryingUser = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'],
    });

    const participantName = queryingUser
      ? `${queryingUser.firstName ?? ''} ${queryingUser.lastName ?? ''}`.trim() ||
        queryingUser.email
      : 'A participant';

    this.eventEmitter.emit('split_bill.query_raised', {
      creatorId: bill.creatorId,
      participantName,
      billTitle: bill.title,
      billId,
      participantId: participant.id,
      message: dto.message,
      amountOwed: participant.amountOwed,
      currency: bill.currency,
      pushToken: bill.creator?.fcmToken,
    });

    this.logger.log(`[SplitBill] Query raised by ${userId} on bill ${billId}`);
  }

  async getBillQueries(billId: string, actorId: string, page = 1, limit = 50) {
    const bill = await this.billRepo.findOne({ where: { id: billId } });
    if (!bill) throw new NotFoundException('Bill not found');

    if (bill.creatorId !== actorId) {
      throw new ForbiddenException('Only the bill creator can view queries');
    }

    const [queries, total] = await this.activityRepo.findAndCount({
      where: {
        splitBillId: billId,
        actionType: ActivityActionType.QUERY_RAISED,
      },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const userIds = [...new Set(queries.map((q) => q.actorId).filter(Boolean))];

    let users: User[] = [];
    if (userIds.length > 0) {
      users = await this.userRepo.findAll({
        where: { id: In(userIds) },
        select: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'],
      });
    }

    const userMap = new Map(users.map((u) => [u.id, u]));

    const queriesWithUsers = queries.map((query) => {
      const user = query.actorId ? userMap.get(query.actorId) : null;
      return {
        ...query,
        user: user
          ? {
              id: user?.id,
              name:
                `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() ||
                user.email,
              email: user.email,
              phoneNumber: user.phoneNumber,
            }
          : null,
      };
    });

    return {
      queries: queriesWithUsers,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ─── Private: Compute and Save Shares ────────────────────────────────────────

  /**
   * Calculates each participant's share in kobo using integer arithmetic (no floats).
   * Updates the participant rows atomically within the provided QueryRunner.
   *
   * EVEN split:
   *   Internal computation done in kobo for precision.
   *   baseKobo = floor(totalKobo / count)
   *   remainderKobo = totalKobo mod count
   *   First `remainderKobo` participants each get (baseKobo + 1) / 100 Naira.
   *   This ensures SUM(shares) === totalAmount exactly.
   *
   * PERCENTAGE split:
   *   share = floor((totalAmount * percentage) / 100)
   *   Any rounding remainder goes to the first participant.
   *
   * MANUAL split:
   *   Caller provides exact amounts per participant.
   *   Service validates sum === totalAmount.
   */
  private async computeAndSaveShares(
    billId: string,
    participants: ValidatedParticipant[],
    splitMethod: SplitMethod,
    qr: QueryRunner,
    overrideTotalAmount?: number,
  ): Promise<ComputeSharesResult> {
    const bill = await qr.manager.findOne(SplitBill, { where: { id: billId } });
    if (!bill) throw new NotFoundException('Bill not found');

    const totalAmount = Number(overrideTotalAmount ?? Number(bill.totalAmount));
    const count = participants.length;

    const dbRows = await qr.manager.find(SplitBillParticipant, {
      where: { splitBillId: billId },
      order: { createdAt: 'ASC', id: 'ASC' },
    });

    const owedAmounts: number[] = new Array(count).fill(0);

    switch (splitMethod) {
      case SplitMethod.EVEN: {
        const totalKobo = Math.round(totalAmount * 100);
        const baseKobo = Math.floor(totalKobo / count);
        const remainderKobo = totalKobo % count;

        for (let i = 0; i < count; i++) {
          const participantKobo = baseKobo + (i < remainderKobo ? 1 : 0);
          owedAmounts[i] = participantKobo / 100;
        }
        break;
      }

      case SplitMethod.PERCENTAGE: {
        let allocatedKobo = 0;
        const totalKobo = Math.round(totalAmount * 100);

        for (let i = 0; i < count; i++) {
          const pct = participants[i].percentage;
          if (pct === undefined || pct < 0 || pct > 100) {
            throw new BadRequestException(
              `Participant ${i + 1} has invalid percentage. Must be 0-100.`,
            );
          }
          // Integer arithmetic in kobo
          const shareKobo = Math.floor((totalKobo * pct) / 100);
          owedAmounts[i] = shareKobo / 100;
          allocatedKobo += shareKobo;
        }

        const pctSum = participants.reduce(
          (s, p) => s + (p.percentage ?? 0),
          0,
        );
        if (pctSum !== 100) {
          throw new BadRequestException(
            `Percentages must sum to 100. Current sum: ${pctSum}`,
          );
        }

        // Distribute rounding remainder (in kobo) to first participant
        const roundingRemainderKobo = totalKobo - allocatedKobo;
        if (roundingRemainderKobo > 0) {
          owedAmounts[0] =
            (Math.round(owedAmounts[0] * 100) + roundingRemainderKobo) / 100;
        }
        break;
      }

      case SplitMethod.MANUAL: {
        let manualSum = 0;
        for (let i = 0; i < count; i++) {
          const amt = participants[i].amount; // Now in Naira
          if (amt === undefined || amt < 0) {
            throw new BadRequestException(
              `Participant ${i + 1} requires a valid amount (Naira) for MANUAL split`,
            );
          }
          owedAmounts[i] = amt;
          manualSum += amt;
        }

        // Use epsilon-style or kobo-based comparison for floats
        if (Math.abs(manualSum - totalAmount) > 0.001) {
          throw new BadRequestException(
            `Manual amounts sum to ₦${manualSum} but bill is ₦${totalAmount}. ` +
              `Difference: ₦${Math.round((totalAmount - manualSum) * 100) / 100}.`,
          );
        }
        break;
      }

      default:
        throw new BadRequestException(
          `Unsupported split method: ${splitMethod}`,
        );
    }

    const adjustments: ShareAdjustment[] = [];

    for (let i = 0; i < dbRows.length; i++) {
      const row = dbRows[i];
      const oldOwed = Number(row.amountOwed);
      const newOwed = owedAmounts[i];
      const paid = Number(row.amountPaid);
      const balanceAdj = Number(row.balanceAdjustment);
      const effectiveOwed = newOwed + balanceAdj;
      const newRemaining = Math.max(0, effectiveOwed - paid);

      let newStatus = row.status;

      if (
        row.status !== ParticipantStatus.INVITED &&
        row.status !== ParticipantStatus.DECLINED
      ) {
        if (paid >= effectiveOwed && effectiveOwed > 0) {
          newStatus = ParticipantStatus.PAID;
          if (paid > effectiveOwed) {
            adjustments.push({
              participantId: row.id,
              participantName: row.guestName ?? row.userId ?? 'Unknown',
              oldOwed,
              newOwed,
              amountPaid: paid,
              action: 'REFUND_REQUIRED',
              overAmount: paid - effectiveOwed,
              message: `Participant overpaid by ${paid - effectiveOwed} kobo. Refund required.`,
            });
          }
        } else if (paid > 0 && paid < effectiveOwed) {
          newStatus = ParticipantStatus.PARTIAL;
          if (newOwed > oldOwed) {
            adjustments.push({
              participantId: row.id,
              participantName: row.guestName ?? row.userId ?? 'Unknown',
              oldOwed,
              newOwed,
              amountPaid: paid,
              action: 'ADDITIONAL_PAYMENT_REQUIRED',
              additionalOwed: effectiveOwed - paid,
              message: `Additional ${effectiveOwed - paid} kobo required after amount change.`,
            });
          }
        } else if (paid === 0) {
          newStatus = ParticipantStatus.UNPAID;
          if (newOwed !== oldOwed) {
            adjustments.push({
              participantId: row.id,
              participantName: row.guestName ?? row.userId ?? 'Unknown',
              oldOwed,
              newOwed,
              amountPaid: 0,
              action: 'AMOUNT_ADJUSTED',
              message: `Amount changed from ₦${oldOwed} to ₦${newOwed}.`,
            });
          }
        }
      }

      await qr.manager.update(SplitBillParticipant, row.id, {
        amountOwed: newOwed,
        amountRemaining: newRemaining,
        status: newStatus,
      });
    }

    return {
      adjustments,
      hasRefundsRequired: adjustments.some(
        (a) => a.action === 'REFUND_REQUIRED',
      ),
      hasAdditionalPaymentsRequired: adjustments.some(
        (a) => a.action === 'ADDITIONAL_PAYMENT_REQUIRED',
      ),
    };
  }

  // ─── Private: Manual Redistribution ──────────────────────────────────────────

  private async applyManualRedistribution(
    bill: SplitBill,
    redistribution: Array<{ participantId: string; value: number }>,
    expectedTotal: number,
    qr: QueryRunner,
    allowedIds?: string[],
  ): Promise<void> {
    const targetIds = allowedIds ?? bill.participants.map((p) => p.id);

    const redistributionTotal = redistribution.reduce((s, r) => s + r.value, 0);

    if (redistributionTotal !== expectedTotal) {
      throw new BadRequestException(
        `Redistribution total ₦${redistributionTotal} must equal ₦${expectedTotal}.`,
      );
    }

    for (const redist of redistribution) {
      if (!targetIds.includes(redist.participantId)) {
        throw new BadRequestException(
          `Invalid participantId in redistribution: ${redist.participantId}`,
        );
      }
      if (redist.value < 0) {
        throw new BadRequestException(`Redistribution amounts must be >= 0`);
      }

      const p = bill.participants.find((x) => x.id === redist.participantId);
      if (p && p.amountPaid > redist.value) {
        throw new BadRequestException(
          `Cannot set ${p.guestName ?? 'User'}'s share to ₦${redist.value} — ` +
            `they've already paid ₦${p.amountPaid}. Refund first.`,
        );
      }

      await qr.manager.update(SplitBillParticipant, redist.participantId, {
        amountOwed: redist.value,
        amountRemaining: Math.max(0, redist.value - (p?.amountPaid ?? 0)),
      });
    }
  }

  private async applyPercentageRedistribution(
    bill: SplitBill,
    redistribution: Array<{ participantId: string; value: number }>,
    expectedTotal: number,
    qr: QueryRunner,
    allowedIds?: string[],
  ): Promise<void> {
    const targetIds = allowedIds ?? bill.participants.map((p) => p.id);
    const pctTotal = redistribution.reduce((s, r) => s + r.value, 0);

    if (pctTotal !== expectedTotal) {
      throw new BadRequestException(
        `Redistribution percentages sum to ${pctTotal}% but must equal ${expectedTotal}%.`,
      );
    }

    for (const redist of redistribution) {
      if (!targetIds.includes(redist.participantId)) {
        throw new BadRequestException(
          `Invalid participantId: ${redist.participantId}`,
        );
      }
      if (redist.value < 0 || redist.value > 100) {
        throw new BadRequestException(
          `Invalid percentage ${redist.value} — must be 0-100`,
        );
      }
      await qr.manager.update(SplitBillParticipant, redist.participantId, {
        percentage: redist.value,
      });
    }
  }

  // ─── Private: Validate Participants ──────────────────────────────────────────

  private async validateParticipants(
    participants: Array<any>,
    splitMethod: SplitMethod,
  ): Promise<ValidatedParticipant[]> {
    if (!participants?.length) {
      throw new BadRequestException('At least one participant is required');
    }

    const phoneRegex = /^\+?[0-9]{10,15}$/;
    const seenUserIds = new Set<string>();
    const seenPhones = new Set<string>();
    const result: ValidatedParticipant[] = [];
    const userIdsToValidate: string[] = [];

    for (const p of participants) {
      if (p.type === 'USER') {
        if (!p.userId)
          throw new BadRequestException('USER participant requires userId');
        if (seenUserIds.has(p.userId)) {
          throw new BadRequestException(`Duplicate userId: ${p.userId}`);
        }
        seenUserIds.add(p.userId);
        userIdsToValidate.push(p.userId);

        result.push({
          type: 'USER',
          userId: p.userId,
          amount: p.amount,
          percentage: p.percentage,
        });

        const settingsRepo = this.dataSource.getRepository(Settings);
        const settingsList = await settingsRepo.find({
          where: { user: { id: In(userIdsToValidate) } },
          select: ['allowSplitBillInvites'],
          relations: ['user'],
        });

        const blockedUsers = settingsList
          .filter((s) => !s.allowSplitBillInvites)
          .map((s) => `${s.user.firstName} ${s.user.lastName}`);

        if (blockedUsers.length > 0) {
          throw new BadRequestException(
            `These users have disabled split bill invites: ${blockedUsers.join(', ')}`,
          );
        }
      } else if (p.type === 'GUEST') {
        if (!p.name || p.name.trim().length < 2) {
          throw new BadRequestException(`Invalid guest name: "${p.name}"`);
        }
        if (!p.phone || !phoneRegex.test(p.phone)) {
          throw new BadRequestException(
            `Guest "${p.name}" requires a valid phone number`,
          );
        }
        if (seenPhones.has(p.phone)) {
          throw new BadRequestException(`Duplicate guest phone: ${p.phone}`);
        }
        seenPhones.add(p.phone);

        result.push({
          type: 'GUEST',
          guestName: p.name.trim(),
          guestPhone: p.phone,
          guestEmail: p.email ?? null,
          amount: p.amount,
          percentage: p.percentage,
        });
      } else {
        throw new BadRequestException('Participant type must be USER or GUEST');
      }
    }

    // Batch validate all user IDs exist
    if (userIdsToValidate.length > 0) {
      const foundUsers = await this.userRepo.findAll({
        where: { id: In(userIdsToValidate) },
        select: ['id'],
      });
      const foundIds = new Set(foundUsers.map((u) => u.id));
      const invalidIds = userIdsToValidate.filter((id) => !foundIds.has(id));
      if (invalidIds.length > 0) {
        throw new BadRequestException(
          `Invalid user IDs: ${invalidIds.join(', ')}`,
        );
      }
    }

    return result;
  }

  // ─── Private: Pre-flight share validation ────────────────────────────────────

  private assertSharesAreProvided(
    participants: ValidatedParticipant[],
    splitMethod: SplitMethod,
    totalAmount: number,
  ): void {
    if (splitMethod === SplitMethod.MANUAL) {
      const missing = participants.filter((p) => p.amount === undefined);
      if (missing.length > 0) {
        throw new BadRequestException(
          `MANUAL split requires an amount for every participant. ` +
            `${missing.length} participant(s) are missing amounts.`,
        );
      }
      const sum = participants.reduce((s, p) => s + (p.amount ?? 0), 0);
      if (sum !== totalAmount) {
        throw new BadRequestException(
          `Manual amounts sum to ₦${sum} but bill total is ₦${totalAmount}.`,
        );
      }
    }

    if (splitMethod === SplitMethod.PERCENTAGE) {
      const missing = participants.filter((p) => p.percentage === undefined);
      if (missing.length > 0) {
        throw new BadRequestException(
          `PERCENTAGE split requires a percentage for every participant. ` +
            `${missing.length} participant(s) are missing percentages.`,
        );
      }
      const pctSum = participants.reduce((s, p) => s + (p.percentage ?? 0), 0);
      if (pctSum !== 100) {
        throw new BadRequestException(
          `Percentages must sum to exactly 100. Current sum: ${pctSum}.`,
        );
      }
    }
  }

  // ─── Private: Activity Logger ──────────────────────────────────────────────────

  private async logActivity(
    qr: QueryRunner,
    data: {
      splitBillId: string;
      actorId: string | null;
      actionType: ActivityActionType;
      description?: string;
      participantId?: string;
      amountBefore?: number;
      amountAfter?: number;
      amountDifference?: number;
      billStatusAtTime?: string;
      transactionId?: string;
      metadata?: Record<string, any>;
    },
  ): Promise<void> {
    await qr.manager.save(SplitBillActivity, {
      splitBillId: data.splitBillId,
      actorId: data.actorId,
      actionType: data.actionType,
      description: data.description ?? null,
      participantId: data.participantId ?? null,
      amountBefore: data.amountBefore ?? null,
      amountAfter: data.amountAfter ?? null,
      amountDifference: data.amountDifference ?? null,
      billStatusAtTime: data.billStatusAtTime ?? null,
      transactionId: data.transactionId ?? null,
      metadata: data.metadata ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // ─── Private: Helpers ─────────────────────────────────────────────────────────

  private generateInviteCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 10; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }
}
