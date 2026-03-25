import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  EventRepository,
  EventCategoryRepository,
  EventOrganizerRepository,
  EventContributionRepository,
} from '../repository';
import {
  CreateEventDto,
  UpdateEventDto,
  ContributeToEventDto,
} from '../dto/event.dto';
import { Event, EventOrganizer, EventContribution } from '../entities';
import { User } from '../../user/entities';
import { WalletService } from '../../wallet/services/wallet.service';
import { Transaction } from '../../transaction/entities';
import {
  TransactionType,
  TransactionDirection,
  TransactionStatus,
} from '../../transaction/enums/transaction.enum';
import {
  EventStatus,
  EventOrganizerRole,
  EventContributionType,
} from '../enums/event.enum';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class EventService {
  private readonly logger = new Logger(EventService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly eventRepository: EventRepository,
    private readonly eventCategoryRepository: EventCategoryRepository,
    private readonly eventOrganizerRepository: EventOrganizerRepository,
    private readonly eventContributionRepository: EventContributionRepository,
    private readonly walletService: WalletService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(createEventDto: CreateEventDto, user: User): Promise<Event> {
    const {
      name,
      hashtag,
      shortDescription,
      category: categoryName,
      coverImages,
      startDateTime,
      startTime,
      spanMultipleDays,
      endDateTime,
      organizers,
      internalOrganizers,
      detailedDescription,
      location,
      financing,
    } = createEventDto;

    // Resolve category
    let category = await this.eventCategoryRepository.findOne({
      where: { name: categoryName },
    });

    if (!category) {
      category = await this.eventCategoryRepository.create({
        name: categoryName,
        isActive: true,
      });
    }

    if (!category) {
      throw new NotFoundException(`Category ${categoryName} could not be resolved`);
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const event = qr.manager.create(Event, {
        name,
        hashtag,
        shortDescription,
        categoryId: category.id,
        category,
        coverImages,
        startDateTime: new Date(startDateTime),
        startTime,
        spanMultipleDays: spanMultipleDays || false,
        endDateTime: endDateTime ? new Date(endDateTime) : null,
        detailedDescription,
        location,
        venueName: location.venueName || '',
        targetAmount: financing.targetAmount || 0,
        expectedParticipants: financing.expectedParticipants || 0,
        acceptDonations: financing.acceptDonations ?? true,
        purchasableItems: financing.purchasableItems || [],
        activities: financing.activities || [],
        externalOrganizers: organizers || [],
        creatorId: user.id,
        status: EventStatus.ACTIVE,
        amountRaised: 0,
      });

      const savedEvent = await qr.manager.save(event);

      // Add creator as owner
      const creatorOrganizer = qr.manager.create(EventOrganizer, {
        eventId: savedEvent.id,
        userId: user.id,
        role: EventOrganizerRole.OWNER,
      });
      await qr.manager.save(creatorOrganizer);

      // Add other internal organizers
      if (internalOrganizers && internalOrganizers.length > 0) {
        const otherOrganizers = internalOrganizers
          .filter((o) => o.userId !== user.id)
          .map((o) =>
            qr.manager.create(EventOrganizer, {
              eventId: savedEvent.id,
              userId: o.userId,
              role: o.role,
            }),
          );
        await qr.manager.save(EventOrganizer, otherOrganizers);
      }

      await qr.commitTransaction();
      return savedEvent;
    } catch (err) {
      await qr.rollbackTransaction();
      this.logger.error('Failed to create event', err);
      throw err;
    } finally {
      await qr.release();
    }
  }

  async findOne(id: string): Promise<Event> {
    const event = await this.eventRepository.findOne({
      where: { id },
      relations: ['category', 'creator', 'organizers', 'organizers.user'],
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return event;
  }

  async contribute(
    eventId: string,
    contributeDto: ContributeToEventDto,
    user: User,
  ): Promise<EventContribution> {
    const event = await this.findOne(eventId);

    if (event.status !== EventStatus.ACTIVE) {
      throw new BadRequestException('Event is not active');
    }

    const { amount, type, details } = contributeDto;

    // Check wallet balance
    const wallet = await this.walletService.getWalletByUserId(user.id);
    if (wallet.availableBalance < amount) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const reference = `EVT-${uuidv4().replace(/-/g, '').substring(0, 15).toUpperCase()}`;

      let transactionType: TransactionType;
      switch (type) {
        case EventContributionType.DONATION:
          transactionType = TransactionType.EVENT_DONATION;
          break;
        case EventContributionType.PURCHASE:
          transactionType = TransactionType.EVENT_PURCHASE;
          break;
        case EventContributionType.GIFTING:
          transactionType = TransactionType.EVENT_GIFTING;
          break;
        default:
          throw new BadRequestException('Invalid contribution type');
      }

      const amountInKobo = Math.round(amount * 100);

      const transaction = await qr.manager.save(
        qr.manager.create(Transaction, {
          walletId: wallet.id,
          amount: amountInKobo,
          currency: 'NGN',
          type: transactionType,
          direction: TransactionDirection.DEBIT,
          status: TransactionStatus.COMPLETED,
          reference,
          description: `Contribution to event: ${event.name} (${type})`,
          metadata: { eventId, type, userId: user.id },
        }),
      );

      // Lock funds into event escrow
      await this.walletService.lockIntoEscrow({
        walletId: wallet.id,
        amount: amountInKobo,
        transactionId: transaction.id,
        entityType: 'event',
        entityId: event.id,
        description: `Escrow for contribution to event: ${event.name}`,
        qr,
      });

      const contribution = qr.manager.create(EventContribution, {
        eventId: event.id,
        userId: user.id,
        type,
        amount: amount, // Store in Naira (transformer handles DB conversion)
        details,
        transactionId: transaction.id,
      });

      const savedContribution = await qr.manager.save(contribution);

      // Update event amount raised
      await qr.manager.update(Event, event.id, {
        amountRaised: () => `amount_raised + ${amountInKobo}`,
      });

      await qr.commitTransaction();

      // Emit event for real-time update
      this.eventEmitter.emit('event.contribution_created', {
        eventId: event.id,
        contribution: savedContribution,
        newTotal: Number(event.amountRaised * 100) + amountInKobo, // working with kobo for accuracy
      });

      return savedContribution;
    } catch (err) {
      await qr.rollbackTransaction();
      this.logger.error(`Contribution failed for event ${eventId}`, err);
      throw err;
    } finally {
      await qr.release();
    }
  }

  async getLeaderboard(eventId: string) {
    return this.eventContributionRepository
      .createQueryBuilder('contribution')
      .select('contribution.userId', 'userId')
      .addSelect('SUM(contribution.amount)', 'totalAmount')
      .leftJoin('contribution.user', 'user')
      .addSelect('user.firstName', 'firstName')
      .addSelect('user.lastName', 'lastName')
      .addSelect('user.username', 'username')
      .where('contribution.eventId = :eventId', { eventId })
      .groupBy('contribution.userId')
      .addGroupBy('user.id')
      .orderBy('totalAmount', 'DESC')
      .limit(10)
      .getRawMany();
  }

  async findAll(categoryId?: string) {
    const query = this.eventRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.category', 'category')
      .leftJoinAndSelect('event.creator', 'creator')
      .where('event.status = :status', { status: EventStatus.ACTIVE });

    if (categoryId) {
      query.andWhere('event.categoryId = :categoryId', { categoryId });
    }

    return query.orderBy('event.createdAt', 'DESC').getMany();
  }
}
