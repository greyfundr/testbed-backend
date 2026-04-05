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
} from '../../transaction/enums/transaction.enum';
import { WalletService } from '../../wallet/services';
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
  MyBillItem,
  MyParticipantSlice,
} from '../dto/split-bill.dto';
import { UserRepository } from '../../user/repository';
import { TransactionRepository } from '../../transaction/repository';
import { PaymentService } from '../../payment/services';

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
    private readonly userRepo: UserRepository,
    private readonly transactionRepo: TransactionRepository,
    private readonly walletService: WalletService,
    private readonly paymentService: PaymentService,
    private readonly dataSource: DataSource,
  ) {}

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
        status: SplitBillStatus.DRAFT,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        imageUrl: dto.imageUrl ?? null,
        billReceipt: dto.billReceipt ?? null,
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
        visibility:
          (dto.visibility as 'public' | 'private' | 'semi_private') ??
          'private',
        recipientUserId: dto.recipientUserId ?? creatorId,
        isFinalized: false,
      });

      const bill = await qr.manager.save(newBill);

      const participantRows = validated.map((p) =>
        qr.manager.create(SplitBillParticipant, {
          splitBillId: bill.id,
          userId: p.userId ?? null,
          guestName: p.guestName ?? null,
          guestPhone: p.guestPhone ?? null,
          guestEmail: p.guestEmail ?? null,
          role:
            p.userId === creatorId
              ? ParticipantRole.CREATOR
              : ParticipantRole.PARTICIPANT,
          status: ParticipantStatus.INVITED,
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
        }),
      );

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
    const bill = await this.billRepo.findOne({
      where: { id: billId },
      relations: ['participants', 'participants.user'],
    });

    if (!bill) {
      throw new NotFoundException('Bill not found');
    }

    if (requestingUserId) {
      const hasAccess =
        bill.creatorId === requestingUserId ||
        bill.participants.some((p) => p.userId === requestingUserId);

      if (!hasAccess && bill.visibility === 'private') {
        throw new ForbiddenException('You do not have access to this bill');
      }
    }

    return bill;
  }

  async getUserBills(
    userId: string,
    dto: GetUserBillsDto,
  ): Promise<{
    bills: SplitBill[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const { status, role = 'all', page = 1, limit = 20 } = dto;
    const offset = (page - 1) * limit;

    if (role === 'creator') {
      const qb = this.billRepo
        .createQueryBuilder('bill')
        .leftJoinAndSelect('bill.participants', 'p')
        .where('bill.creatorId = :userId', { userId })
        .orderBy('bill.createdAt', 'DESC')
        .skip(offset)
        .take(limit);

      if (status) qb.andWhere('bill.status = :status', { status });

      const [bills, total] = await qb.getManyAndCount();
      return { bills, total, page, totalPages: Math.ceil(total / limit) };
    }

    if (role === 'participant') {
      const qb = this.billRepo
        .createQueryBuilder('bill')
        .leftJoinAndSelect('bill.participants', 'p')
        .innerJoin('bill.participants', 'myPart', 'myPart.userId = :userId', {
          userId,
        })
        .orderBy('bill.createdAt', 'DESC')
        .skip(offset)
        .take(limit);

      if (status) qb.andWhere('bill.status = :status', { status });

      const [bills, total] = await qb.getManyAndCount();
      return { bills, total, page, totalPages: Math.ceil(total / limit) };
    }

    const qb = this.billRepo
      .createQueryBuilder('bill')
      .leftJoinAndSelect('bill.participants', 'p')
      .where(
        `bill.creatorId = :userId OR EXISTS (
          SELECT 1 FROM split_bill_participants sp
          WHERE sp.split_bill_id = bill.id AND sp.user_id = :userId AND sp.deleted_at IS NULL
        )`,
        { userId },
      )
      .orderBy('bill.createdAt', 'DESC')
      .skip(offset)
      .take(limit);

    if (status) qb.andWhere('bill.status = :status', { status });

    const [bills, total] = await qb.getManyAndCount();
    return { bills, total, page, totalPages: Math.ceil(total / limit) };
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
      const paidUserIds = new Set(
        paidParticipants.map((p) => p.userId).filter(Boolean),
      );
      const paidGuestPhones = new Set(
        paidParticipants.map((p) => p.guestPhone).filter(Boolean),
      );

      if (participantsChanging) {
        const incomingUserIds = new Set(
          dto.participants!.map((p) => p.userId).filter(Boolean),
        );
        const incomingPhones = new Set(
          dto.participants!.map((p) => p.guestPhone).filter(Boolean),
        );

        for (const p of paidParticipants) {
          const stillPresent = p.userId
            ? incomingUserIds.has(p.userId)
            : incomingPhones.has(p.guestPhone!);

          if (!stillPresent) {
            throw new BadRequestException(
              `Cannot remove participant ${p.userId ?? p.guestPhone} — ` +
                `they have already made a payment of ₦${p.amountPaid}.`,
            );
          }
        }
      }

      if (paidParticipants.length > 0 && (amountChanging || methodChanging)) {
        const isManualReassignment =
          effectiveMethod === SplitMethod.MANUAL &&
          participantsChanging &&
          dto.participants!.every((p) => p.amountOwed !== undefined);

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
      if (dto.billReceipt !== undefined)
        updateData.billReceipt = dto.billReceipt;
      if (dto.allowPartialPayment !== undefined)
        updateData.allowPartialPayment = dto.allowPartialPayment;
      if (dto.visibility !== undefined)
        updateData.visibility = dto.visibility as any;
      if (dto.recipientUserId !== undefined)
        updateData.recipientUserId = dto.recipientUserId;

      await qr.manager.update(SplitBill, billId, updateData);

      if (participantsChanging) {
        const currentParticipants = await qr.manager.find(
          SplitBillParticipant,
          {
            where: { splitBillId: billId },
          },
        );

        const incomingKeys = new Set(
          dto.participants!.map((p) =>
            p.userId ? `user:${p.userId}` : `guest:${p.guestPhone}`,
          ),
        );

        const toRemove = currentParticipants.filter((p) => {
          const key = p.userId ? `user:${p.userId}` : `guest:${p.guestPhone}`;
          return !incomingKeys.has(key);
        });

        if (toRemove.length) {
          await qr.manager.remove(SplitBillParticipant, toRemove);
        }

        const mappedParticipants = dto.participants!.map((p) => ({
          type: p.userId ? 'USER' : 'GUEST',
          userId: p.userId,
          name: p.guestName,
          phone: p.guestPhone,
          percentage: p.percentage,
          amount: p.amountOwed,
        }));

        const validatedParticipants = await this.validateParticipants(
          mappedParticipants,
          effectiveMethod,
        );

        if (effectiveMethod === SplitMethod.MANUAL) {
          const totalAssigned = dto.participants!.reduce(
            (sum, p) => sum + (p.amountOwed ?? 0),
            0,
          );

          if (totalAssigned !== effectiveAmount) {
            throw new BadRequestException(
              `Manual split amounts must sum to the total bill amount. ` +
                `Got ₦${totalAssigned}, expected ₦${effectiveAmount}.`,
            );
          }

          for (const p of dto.participants!) {
            const key = p.userId ? `user:${p.userId}` : `guest:${p.guestPhone}`;
            const existing = currentParticipants.find((cp) =>
              p.userId
                ? cp.userId === p.userId
                : cp.guestPhone === p.guestPhone,
            );

            const amountOwed = p.amountOwed!;
            const alreadyPaid = existing?.amountPaid ?? 0;
            const amountDue = Math.max(0, amountOwed - alreadyPaid);

            await qr.manager.upsert(
              SplitBillParticipant,
              {
                ...(existing ?? {}),
                splitBillId: billId,
                userId: p.userId ?? null,
                guestName: p.guestName ?? null,
                guestPhone: p.guestPhone ?? null,
                percentage: null,
                amountOwed,
                amountPaid: existing?.amountPaid ?? 0,
                amountRemaining: amountDue,
              },
              p.userId
                ? ['splitBillId', 'userId']
                : ['splitBillId', 'guestPhone'],
            );
          }
        } else {
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
            'Cannot auto-recalculate a MANUAL split when changing amount or method. ' +
              'Provide an explicit participants list with amountOwed for each.',
          );
        }

        const currentParticipants = await qr.manager.find(
          SplitBillParticipant,
          {
            where: { splitBillId: billId },
          },
        );

        const participantInputs: ValidatedParticipant[] =
          currentParticipants.map((p) => ({
            type: p.userId ? 'USER' : 'GUEST',
            userId: p.userId ?? undefined,
            guestName: p.guestName ?? undefined,
            guestPhone: p.guestPhone ?? undefined,
            percentage: p.percentage ?? undefined,
          }));

        await this.computeAndSaveShares(
          billId,
          participantInputs,
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
      return this.getBillById(billId, actorId);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
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

      // ── Validate the new participant ──────────────────────────────────────
      if (dto.type === 'USER') {
        if (!dto.userId)
          throw new BadRequestException(
            'userId is required for USER participant',
          );

        const user = await this.userRepo.findOne({
          where: { id: dto.userId },
          select: ['id'],
        });
        if (!user) throw new NotFoundException(`User ${dto.userId} not found`);

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
    participantId: string,
    payerId: string,
    dto: PayBillShareDto,
  ): Promise<{ participantFullyPaid: boolean; billFullyFunded: boolean }> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // Lock both participant and bill atomically
      const participant = await qr.manager.findOne(SplitBillParticipant, {
        where: { id: participantId, splitBillId: billId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!participant) throw new NotFoundException('Participant not found');
      if (participant.userId !== payerId)
        throw new ForbiddenException('You can only pay your own share');

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
      if (bill.status === SplitBillStatus.FUNDED) {
        throw new BadRequestException('Bill is already fully funded');
      }

      const effectiveOwed =
        participant.amountOwed + participant.balanceAdjustment;

      if (participant.amountPaid >= effectiveOwed) {
        throw new BadRequestException('Your share is already fully paid');
      }

      const remaining = effectiveOwed - participant.amountPaid;

      if (!bill.allowPartialPayment && dto.amount < remaining) {
        throw new BadRequestException(
          `This bill requires full payment. You owe ₦${remaining}.`,
        );
      }

      if (bill.minPaymentAmount && dto.amount < bill.minPaymentAmount) {
        throw new BadRequestException(
          `Minimum payment is ₦${bill.minPaymentAmount}.`,
        );
      }

      if (dto.amount > remaining) {
        throw new BadRequestException(
          `Payment of ₦${dto.amount} exceeds remaining balance of ₦${remaining}.`,
        );
      }

      // ── Get payer's wallet ────────────────────────────────────────────────
      const wallet = await this.walletService.getWalletByUserId(payerId);

      // ── Create transaction record ─────────────────────────────────────────
      const txReference = `SB-${uuidv4().replace(/-/g, '').substring(0, 20).toUpperCase()}`;

      const tx = await qr.manager.save(Transaction, {
        walletId: wallet.id,
        amount: dto.amount,
        currency: bill.currency,
        type: TransactionType.SPLIT_BILL_PAYMENT,
        direction: TransactionDirection.DEBIT,
        status: TransactionStatus.PROCESSING,
        reference: txReference,
        paymentGateway: 'internal',
        description: `Split bill payment — ${bill.title}`,
        sourceRef: {
          entity: 'split_bill',
          id: billId,
          participantId: participant.id,
        },
        metadata: {
          billTitle: bill.title,
          billId,
          participantId: participant.id,
        },
      });

      // ── Debit wallet into escrow ──────────────────────────────────────────
      await this.walletService.lockIntoEscrow({
        walletId: wallet.id,
        amount: dto.amount,
        transactionId: tx.id,
        entityType: 'split_bill',
        entityId: billId,
        description: `Escrow for split bill "${bill.title}"`,
        qr,
      });

      // ── Update transaction to completed ───────────────────────────────────
      await qr.manager.update(Transaction, tx.id, {
        status: TransactionStatus.COMPLETED,
        confirmedAt: new Date(),
      });

      // ── Update participant ────────────────────────────────────────────────
      const newAmountPaid = participant.amountPaid + dto.amount;
      const newAmountRemaining = Math.max(0, effectiveOwed - newAmountPaid);
      const participantFullyPaid = newAmountRemaining === 0;

      await qr.manager.update(SplitBillParticipant, participantId, {
        amountPaid: newAmountPaid,
        amountRemaining: newAmountRemaining,
        status: participantFullyPaid
          ? ParticipantStatus.PAID
          : ParticipantStatus.PARTIAL,
        walletId: wallet.id,
        paymentMethod: 'wallet',
        firstPaidAt: participant.firstPaidAt ?? new Date(),
        fullyPaidAt: participantFullyPaid ? new Date() : null,
      });

      // ── Update bill totals ────────────────────────────────────────────────
      const newTotalCollected = bill.totalCollected + dto.amount;
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

      // ── Activity logs ──────────────────────────────────────────────────────
      await this.logActivity(qr, {
        splitBillId: billId,
        actorId: payerId,
        actionType: ActivityActionType.PAYMENT_MADE,
        participantId,
        description: `Payment of ₦${dto.amount} made`,
        amountBefore: participant.amountPaid,
        amountAfter: newAmountPaid,
        amountDifference: dto.amount,
        billStatusAtTime: bill.status,
        transactionId: tx.id,
        metadata: { participantFullyPaid, billFullyFunded },
      });

      if (billFullyFunded) {
        await this.logActivity(qr, {
          splitBillId: billId,
          actorId: null,
          actionType: ActivityActionType.BILL_FUNDED,
          description: 'Bill fully funded — all participants have paid',
          billStatusAtTime: SplitBillStatus.FUNDED,
          metadata: { totalCollected: newTotalCollected },
        });
      }

      await qr.commitTransaction();

      this.logger.log(
        `Bill payment: ₦${dto.amount} by ${payerId} for bill ${billId} (participant ${participantId})`,
      );

      return { participantFullyPaid, billFullyFunded };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
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

  async cancelBill(
    billId: string,
    actorId: string,
    dto: CancelBillDto,
  ): Promise<SplitBill> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

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

      if (bill.totalCollected > 0) {
        throw new BadRequestException(
          'Cannot cancel a bill with existing payments. Refund all participants first, or contact support.',
        );
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
        metadata: { reason: dto.reason },
      });

      await qr.commitTransaction();

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
      relations: ['participants'],
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

    // TODO: plug into NotificationService here
    // await this.notificationService.sendBillReminders(bill, unpaidParticipants);

    await this.billRepo.update(billId, {
      reminderSentCount: () => 'reminder_sent_count + 1',
      lastReminderAt: new Date(),
    });

    for (const p of unpaidParticipants) {
      await this.participantRepo.update(p.id, {
        reminderCount: () => 'reminder_count + 1',
        lastRemindedAt: new Date(),
      });
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

  async getMyBills(
    userId: string,
    dto: GetMyBillsDto,
  ): Promise<{
    bills: MyBillItem[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const { status, role = MyBillsRole.ALL, page = 1, limit = 20 } = dto;
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
        `bill.creatorId = :userId OR EXISTS (
      SELECT 1 FROM split_bill_participants sp
      WHERE sp.split_bill_id = bill.id
        AND sp.user_id = :userId
        AND sp.deleted_at IS NULL
    )`,
        { userId },
      )
      .orderBy('bill.createdAt', 'DESC')
      .skip(offset)
      .take(limit);

    if (status) {
      qb.andWhere('bill.status = :status', { status });
    }

    if (role === MyBillsRole.CREATOR) {
      qb.andWhere('bill.creatorId = :userId', { userId });
    } else if (role === MyBillsRole.PARTICIPANT) {
      qb.andWhere('bill.creatorId != :userId', { userId });
    }

    const [bills, total] = await qb.getManyAndCount();

    const shaped: MyBillItem[] = bills.map((bill) => {
      const myParticipant = bill.participants?.[0] ?? null;

      const myShare: MyParticipantSlice = myParticipant
        ? {
            participantId: myParticipant.id,
            role: myParticipant.role,
            amountOwed: myParticipant.amountOwed,
            amountPaid: myParticipant.amountPaid,
            amountRemaining: myParticipant.amountRemaining,
            status: myParticipant.status,
            inviteCode: myParticipant.inviteCode,
            paymentLink: myParticipant.paymentLink,
          }
        : {
            participantId: '',
            role: 'creator',
            amountOwed: 0,
            amountPaid: 0,
            amountRemaining: 0,
            status: 'n/a',
            inviteCode: null,
            paymentLink: null,
          };

      return {
        id: bill.id,
        title: bill.title,
        description: bill.description,
        imageUrl: bill.imageUrl,
        billReceipt: bill.billReceipt,
        totalAmount: bill.totalAmount,
        totalCollected: bill.totalCollected,
        currency: bill.currency,
        splitMethod: bill.splitMethod,
        status: bill.status,
        dueDate: bill.dueDate,
        totalParticipants: bill.totalParticipants,
        totalPaidParticipants: bill.totalPaidParticipants,
        isFinalized: bill.isFinalized,
        creatorId: bill.creatorId,
        creatorName: bill.creator
          ? `${bill.creator.firstName ?? ''} ${bill.creator.lastName ?? ''}`.trim() ||
            bill.creator.email
          : null,
        visibility: bill.visibility,
        createdAt: bill.createdAt,
        myShare,
      };
    });

    return {
      bills: shaped,
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

    // Load current DB participant rows in deterministic order
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

    // ── Write shares to DB and collect adjustments ────────────────────────
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
