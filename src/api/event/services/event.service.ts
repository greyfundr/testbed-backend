import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
  ForbiddenException,
} from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  EventRepository,
  EventCategoryRepository,
  EventOrganizerRepository,
  EventContributionRepository,
  EventRsvpRepository,
} from '../repository';
import {
  CreateEventDto,
  ContributeToEventDto,
  UpdateEventDraftDto,
  GetAllEventsDto,
  GetMyEventsDto,
  GuestRsvpDto,
  RsvpDto,
  UpdateRsvpDto,
  GetMyRsvpEventsDto,
  GetListingsDto,
} from '../dto/event.dto';
import {
  Event,
  EventOrganizer,
  EventContribution,
  EventRsvp,
  RsvpStatus,
} from '../entities';
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
  EventPaymentMethod,
  EventVisibilityStatus,
} from '../enums/event.enum';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PaymentService } from '../../payment/services/payment.service';
import { DynamicLinkService } from '../../dynamic-link/services/dynamic-link.service';
import { Listing } from '../interfaces/event.interface';
import { DonationOnBehalfOf } from 'src/api/campaign/enums/campaign.enum';

@Injectable()
export class EventService {
  private readonly logger = new Logger(EventService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly eventRepository: EventRepository,
    private readonly eventCategoryRepository: EventCategoryRepository,
    private readonly eventOrganizerRepository: EventOrganizerRepository,
    private readonly eventContributionRepository: EventContributionRepository,
    private readonly eventRsvpRepository: EventRsvpRepository,
    @Inject(forwardRef(() => WalletService))
    private readonly walletService: WalletService,
    @Inject(forwardRef(() => PaymentService))
    private readonly paymentService: PaymentService,
    @Inject(forwardRef(() => DynamicLinkService))
    private readonly dynamicLinkService: DynamicLinkService,
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
      visibilityStatus,
    } = createEventDto;

    let category = await this.eventCategoryRepository.findOne({
      where: { name: categoryName },
    });

    if (!category) {
      const newCategory = this.eventCategoryRepository.create({
        name: categoryName,
        isActive: true,
      });
      category = await this.eventCategoryRepository.save(await newCategory);
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    let savedEvent: Event;

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
        detailedDescription: [],
        location: {},
        venueName: '',
        targetAmount: 0,
        expectedParticipants: 0,
        acceptDonations: true,
        purchasableItems: [],
        activities: [],
        externalOrganizers: [],
        creatorId: user.id,
        status: EventStatus.ACTIVE,
        amountRaised: 0,
        pageNumber: 1,
        visibilityStatus,
      });

      savedEvent = await qr.manager.save(Event, event);

      const creatorOrganizer = qr.manager.create(EventOrganizer, {
        eventId: savedEvent.id,
        userId: user.id,
        role: EventOrganizerRole.OWNER,
      });
      await qr.manager.save(EventOrganizer, creatorOrganizer);

      await qr.commitTransaction();
    } catch (err) {
      await qr.rollbackTransaction();
      this.logger.error('Failed to create event in transaction', err);
      throw err;
    } finally {
      await qr.release();
    }

    try {
      const { shortUrl } = await this.dynamicLinkService.forEvent(
        savedEvent.id,
        savedEvent.name,
      );

      if (shortUrl) {
        await this.eventRepository.update(savedEvent.id, {
          shareLink: shortUrl,
        });
        savedEvent.shareLink = shortUrl;
      }
    } catch (linkErr) {
      this.logger.warn(
        `Event created, but failed to generate short link for event ${savedEvent.id}`,
        linkErr,
      );
    }

    return savedEvent;
  }

  async getMyDraft(userId: string): Promise<Event | null> {
    return this.eventRepository.findOne({
      where: { creatorId: userId, isPublished: false },
      order: { updatedAt: 'DESC' },
      relations: ['category', 'organizers'],
    });
  }

  private async getOwnedDraft(eventId: string, userId: string): Promise<Event> {
    const event = await this.eventRepository.findOne({
      where: { id: eventId },
    });
    if (!event) throw new NotFoundException('Event not found');
    if (event.creatorId !== userId)
      throw new ForbiddenException('You do not own this event');
    // if (event.isPublished)
    //   throw new BadRequestException(
    //     'Event is already published — use the update endpoint',
    //   );
    return event;
  }

  private assertDraftIsComplete(event: Event): void {
    const missing: string[] = [];
    if (!event.name) missing.push('name');
    if (!event.startDateTime || event.startDateTime.getTime() === 0)
      missing.push('startDateTime');
    if (!event.location?.address) missing.push('location');
    if (!event.venueName) missing.push('venueName');
    if (!event.shortDescription) missing.push('shortDescription');

    if (missing.length) {
      throw new BadRequestException(
        `Cannot publish. Complete these fields first: ${missing.join(', ')}`,
      );
    }
  }

  async updateEventDraft(
    eventId: string,
    dto: UpdateEventDraftDto,
    userId: string,
  ): Promise<Event> {
    const event = await this.getOwnedDraft(eventId, userId);
    const { pageNumber } = dto;

    const update: Partial<Event> = { pageNumber };

    if (dto.name !== undefined) update.name = dto.name;
    if (dto.hashtag !== undefined) update.hashtag = dto.hashtag;
    if (dto.shortDescription !== undefined)
      update.shortDescription = dto.shortDescription;
    if (dto.coverImages !== undefined) update.coverImages = dto.coverImages;

    // if (dto.category !== undefined) {
    //   let category = await this.eventCategoryRepository.findOne({
    //     where: { name: dto.category },
    //   });
    //   if (!category) {
    //     category = await this.eventCategoryRepository.save(
    //       this.eventCategoryRepository.create({
    //         name: dto.category,
    //         isActive: true,
    //       }),
    //     );
    //   }
    //   update.categoryId = category.id;
    // }

    if (dto.startDateTime !== undefined)
      update.startDateTime = new Date(dto.startDateTime);
    if (dto.startTime !== undefined) update.startTime = dto.startTime;
    if (dto.endDateTime !== undefined)
      update.endDateTime = new Date(dto.endDateTime);
    if (dto.location !== undefined) {
      update.location = dto.location;
      update.venueName = dto.location.venueName ?? event.venueName ?? '';
    }

    // ── Step 3 fields ──────────────────────────────────────────────────────────
    if (dto.detailedDescription !== undefined)
      update.detailedDescription = dto.detailedDescription;
    if (dto.targetAmount !== undefined) update.targetAmount = dto.targetAmount;
    if (dto.expectedParticipants !== undefined)
      update.expectedParticipants = dto.expectedParticipants;
    if (dto.acceptDonations !== undefined)
      update.acceptDonations = dto.acceptDonations;
    if (dto.purchasableItems !== undefined)
      update.purchasableItems = dto.purchasableItems;
    if (dto.activities !== undefined) update.activities = dto.activities;

    // ── Step 4 fields + publish ───────────────────────────────────────────────
    if (dto.organizers !== undefined)
      update.externalOrganizers = dto.organizers;
    if (dto.visibilityStatus !== undefined)
      update.visibilityStatus = dto.visibilityStatus;
    if (dto.isPublished !== undefined) update.isPublished = dto.isPublished;
    if (dto.hideDonationAmount !== undefined)
      update.hideDonationAmount = dto.hideDonationAmount;

    if (pageNumber === 5) {
      this.assertDraftIsComplete({ ...event, ...update } as Event);
      update.isPublished = true;
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      await qr.manager.update(Event, eventId, update);

      if (pageNumber === 4 && dto.internalOrganizers?.length) {
        const existing = await qr.manager.find(EventOrganizer, {
          where: { eventId },
        });
        const existingUserIds = new Set(existing.map((o) => o.userId));

        const toAdd = dto.internalOrganizers
          .filter((o) => o.userId !== userId && !existingUserIds.has(o.userId))
          .map((o) =>
            qr.manager.create(EventOrganizer, {
              eventId,
              userId: o.userId,
              role: o.role,
            }),
          );

        if (toAdd.length) await qr.manager.save(EventOrganizer, toAdd);

        this.eventEmitter.emit('admin.event_created', {
          eventId,
          eventName: event.name,
          creatorId: userId,
        });
      }

      await qr.commitTransaction();
      return this.findOne(eventId);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async findOne(id: string): Promise<Event> {
    const event = await this.eventRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.category', 'category')
      .leftJoinAndSelect('event.creator', 'creator')
      .leftJoinAndSelect('event.organizers', 'organizers')
      .leftJoinAndSelect('organizers.user', 'user')
      .loadRelationCountAndMap('event.rsvpCount', 'event.rsvps')
      .loadRelationCountAndMap(
        'event.venueCount',
        'event.rsvps',
        'rsvp',
        (qb) =>
          qb.where('rsvp.status = :venueStatus', {
            venueStatus: RsvpStatus.VENUE,
          }),
      )
      .loadRelationCountAndMap(
        'event.onlineCount',
        'event.rsvps',
        'rsvp',
        (qb) =>
          qb.where('rsvp.status = :onlineStatus', {
            onlineStatus: RsvpStatus.ONLINE,
          }),
      )

      .where('event.id = :id', { id })
      .getOne();

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return event;
  }

  async contribute(
    eventId: string,
    contributeDto: ContributeToEventDto,
    user: User,
  ): Promise<EventContribution | any> {
    let {
      type,
      amount,
      details,
      items,
      paymentMethod,
      isAnonymous,
      displayName,
      onBehalfOf,
      onBehalfOfUserId,
      onBehalfOfFullName,
      comment,
      image,
    } = contributeDto;

    if (items && Array.isArray(items)) {
      details = details || {};
      details.items = items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
      }));
    }

    const event = await this.findOne(eventId);

    if (event.status !== EventStatus.ACTIVE) {
      throw new BadRequestException('Event is not active');
    }

    if (type === EventContributionType.DONATION && !event.acceptDonations) {
      throw new BadRequestException('This event does not accept donations');
    }

    if (type === EventContributionType.PURCHASE) {
      if (!details?.items || !Array.isArray(details.items)) {
        throw new BadRequestException(
          'Purchase details with items are required',
        );
      }

      let calculatedTotal = 0;
      details.items.forEach((item: any) => {
        const eventItem = event.purchasableItems?.find(
          (i) => i.name === item.name,
        );
        if (!eventItem)
          throw new NotFoundException(`Item ${item.name} is not available`);
        calculatedTotal += eventItem.price * item.quantity;
      });

      if (amount !== calculatedTotal) {
        throw new BadRequestException(
          'Total amount does not match item prices',
        );
      }
    }

    let publicName = 'Anonymous';
    if (!isAnonymous) {
      if (displayName) {
        publicName = displayName;
      } else if (onBehalfOf === DonationOnBehalfOf.EXTERNAL) {
        publicName = onBehalfOfFullName || 'Guest';
      } else {
        publicName = `${user.firstName} ${user.lastName}`.trim() || user.email;
      }
    }

    if (paymentMethod === EventPaymentMethod.PAYSTACK) {
      const reference = `EC-${uuidv4().replace(/-/g, '').substring(0, 20).toUpperCase()}`;
      return this.paymentService.initiateTransactions({
        amount: Math.round(amount * 100),
        email: user.email,
        reference,
        metadata: {
          purpose: 'EVENT_CONTRIBUTION',
          eventId: event.id,
          userId: user.id,
          contributeDto,
        },
      });
    }

    if (!contributeDto.transactionPin) {
      throw new BadRequestException(
        'Transaction PIN is required for wallet payments',
      );
    }
    await this.walletService.verifyTransactionPin(
      user.id,
      contributeDto.transactionPin,
    );

    const wallet = await this.walletService.getWalletByUserId(user.id);
    if (wallet.availableBalance < amount) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    const reference = `EC-${uuidv4().replace(/-/g, '').substring(0, 20).toUpperCase()}`;
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
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

      const transaction = await qr.manager.save(
        qr.manager.create(Transaction, {
          walletId: wallet.id,
          amount,
          currency: 'NGN',
          type: transactionType,
          direction: TransactionDirection.DEBIT,
          status: TransactionStatus.COMPLETED,
          reference,
          description: `Event Contribution: ${event.name} by ${publicName}`,
          metadata: {
            eventId,
            userId: user.id,
            onBehalfOf,
            isAnonymous,
          },
        }),
      );

      await this.walletService.lockIntoEscrow({
        walletId: wallet.id,
        amount,
        transactionId: transaction.id,
        entityType: 'event',
        entityId: event.id,
        description: `Escrow for contribution to: ${event.name}`,
        qr,
      });

      const contribution = qr.manager.create(EventContribution, {
        eventId: event.id,
        userId: user.id,
        type,
        amount,
        details: details ?? {},
        transactionId: transaction.id,
        isAnonymous: !!isAnonymous,
        displayName: displayName || publicName,
        onBehalfOf,
        onBehalfOfUserId,
        onBehalfOfFullName,
        comment,
        image,
      });

      const savedContribution = await qr.manager.save(contribution);

      await qr.manager.update(Event, event.id, {
        amountRaised: () => `amount_raised + ${amount}`,
      });

      await qr.commitTransaction();

      this.eventEmitter.emit('event.contribution_created', {
        eventId: event.id,
        contribution: savedContribution,
        newTotal: Number(event.amountRaised) + amount,
        contributorName: publicName,
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

  async getContributionHistory(eventId: string) {
    return this.eventContributionRepository
      .createQueryBuilder('contribution')
      .leftJoin('contribution.user', 'user')
      .select([
        'contribution.id',
        'contribution.amount',
        'contribution.comment',
        'contribution.createdAt',
        'contribution.isAnonymous',
        'contribution.displayName',
        'contribution.image',
        'user.firstName',
        'user.lastName',
        'user.username'
      ])
      .where('contribution.eventId = :eventId', { eventId })
      .orderBy('contribution.createdAt', 'DESC')
      .getMany();
  }

  async findAll(dto: GetAllEventsDto) {
    const {
      categoryId,
      status,
      search,
      visibilityStatus,
      fromDate,
      toDate,
      page = 1,
      limit = 20,
    } = dto;
    const offset = (page - 1) * limit;

    const qb = this.eventRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.category', 'category')
      .leftJoinAndSelect('event.creator', 'creator')
      .loadRelationCountAndMap('event.rsvpCount', 'event.rsvps')
      .where('event.visibilityStatus IN (:...publicTypes)', {
        publicTypes: ['public', 'public_registration'],
      })
      // .where('event.isPublished = :published', { published: true })
      .andWhere('event.status = :status', {
        status: status ?? EventStatus.ACTIVE,
      });

    if (categoryId) {
      qb.andWhere('event.categoryId = :categoryId', { categoryId });
    }

    if (visibilityStatus) {
      qb.andWhere('event.visibilityStatus = :visibilityStatus', {
        visibilityStatus,
      });
    } else {
      qb.andWhere('event.visibilityStatus IN (:...publicTypes)', {
        publicTypes: ['public', 'public_registration'],
      });
    }

    if (search) {
      qb.andWhere(
        `(event.name LIKE :search
        OR event.hashtag LIKE :search
        OR event.shortDescription LIKE :search)`,
        { search: `%${search}%` },
      );
    }

    if (fromDate) {
      qb.andWhere('event.startDateTime >= :fromDate', {
        fromDate: new Date(fromDate),
      });
    }

    if (toDate) {
      qb.andWhere('event.startDateTime <= :toDate', {
        toDate: new Date(toDate),
      });
    }

    const [events, total] = await qb
      .orderBy('event.startDateTime', 'ASC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return {
      events: events.map((e) => this.shapeEventResponse(e)),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getMyEvents(userId: string, dto: GetMyEventsDto) {
    const {
      categoryId,
      status,
      search,
      publishedStatus = 'all',
      fromDate,
      toDate,
      page = 1,
      limit = 20,
    } = dto;
    const offset = (page - 1) * limit;

    const qb = this.eventRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.category', 'category')
      .leftJoinAndSelect('event.organizers', 'organizers')
      .loadRelationCountAndMap('event.rsvpCount', 'event.rsvps')
      .where('event.creatorId = :userId', { userId });

    if (publishedStatus === 'published') {
      qb.andWhere('event.isPublished = true');
    } else if (publishedStatus === 'draft') {
      qb.andWhere('event.isPublished = false');
    }

    if (status) {
      qb.andWhere('event.status = :status', { status });
    }

    if (categoryId) {
      qb.andWhere('event.categoryId = :categoryId', { categoryId });
    }

    if (search) {
      qb.andWhere(`(event.name LIKE :search OR event.hashtag LIKE :search)`, {
        search: `%${search}%`,
      });
    }

    if (fromDate) {
      qb.andWhere('event.startDateTime >= :fromDate', {
        fromDate: new Date(fromDate),
      });
    }

    if (toDate) {
      qb.andWhere('event.startDateTime <= :toDate', {
        toDate: new Date(toDate),
      });
    }

    const [events, total] = await qb
      .orderBy('event.createdAt', 'DESC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return {
      events: events.map((e) => this.shapeEventResponse(e)),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  private shapeEventResponse(event: Event) {
    return {
      ...event,
      creatorName: event.creator
        ? `${event.creator.firstName ?? ''} ${event.creator.lastName ?? ''}`.trim() ||
          event.creator.email
        : null,
    };
  }

  async rsvpAsUser(
    eventId: string,
    user: User,
    dto: RsvpDto,
  ): Promise<EventRsvp> {
    const event = await this.getPublishedEvent(eventId);

    this.assertEventAcceptsRsvp(event);

    // if (event.visibilityStatus === EventVisibilityStatus.PRIVATE) {
    //   throw new ForbiddenException(
    //     'This event is private. Contact the organiser to be added.',
    //   );
    // }

    const existing = await this.eventRsvpRepository.findOne({
      where: { eventId, userId: user.id },
    });

    if (existing) {
      throw new BadRequestException('You have already RSVPed to this event');
      // return this.eventRsvpRepository.save({
      //   ...existing,
      //   status: dto.status ?? existing.status,
      //   guestCount: dto.guestCount ?? existing.guestCount,
      //   note: dto.note ?? existing.note,
      //   respondedAt: new Date(),
      // });
    }

    const name =
      dto.name ||
      `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() ||
      user.email;

    return this.eventRsvpRepository.save(
      await this.eventRsvpRepository.create({
        eventId,
        userId: user.id,
        name,
        guestEmail: user.email,
        guestPhone: user.phoneNumber,
        status: dto.status ?? RsvpStatus.VENUE,
        guestCount: dto.guestCount ?? 1,
        note: dto.note ?? null,
        selfRegistered: true,
        respondedAt: new Date(),
      }),
    );
  }

  async rsvpAsGuest(eventId: string, dto: GuestRsvpDto): Promise<EventRsvp> {
    const event = await this.getPublishedEvent(eventId);

    this.assertEventAcceptsRsvp(event);

    if (
      event.visibilityStatus === EventVisibilityStatus.PRIVATE ||
      event.visibilityStatus === EventVisibilityStatus.PRIVATE_INVITATION
    ) {
      throw new ForbiddenException(
        'This event requires an account to RSVP. Please download the GreyFundr app.',
      );
    }

    if (!dto.email && !dto.phone) {
      throw new BadRequestException(
        'At least one contact (email or phone) is required to RSVP as a guest.',
      );
    }

    if (dto.email) {
      const emailExists = await this.eventRsvpRepository.findOne({
        where: { eventId, guestEmail: dto.email },
      });
      if (emailExists) {
        throw new BadRequestException(
          'An RSVP with this email already exists for this event.',
        );
      }
    }

    return this.eventRsvpRepository.save(
      await this.eventRsvpRepository.create({
        eventId,
        userId: null,
        name: dto.name.trim(),
        guestEmail: dto.email ?? null,
        guestPhone: dto.phone ?? null,
        status: dto.status ?? RsvpStatus.VENUE,
        guestCount: dto.guestCount ?? 1,
        note: dto.note ?? null,
        selfRegistered: true,
        respondedAt: new Date(),
      }),
    );
  }

  async updateRsvp(
    rsvpId: string,
    userId: string,
    dto: UpdateRsvpDto,
  ): Promise<EventRsvp> {
    const rsvp = await this.eventRsvpRepository.findOne({
      where: { id: rsvpId },
    });
    if (!rsvp) throw new NotFoundException('RSVP not found');
    if (rsvp.userId !== userId) {
      throw new ForbiddenException('You can only update your own RSVP');
    }

    return this.eventRsvpRepository.save({
      ...rsvp,
      ...(dto.status !== undefined && { status: dto.status }),
      ...(dto.guestCount !== undefined && { guestCount: dto.guestCount }),
      ...(dto.note !== undefined && { note: dto.note }),
      respondedAt: new Date(),
    });
  }

  async cancelRsvp(rsvpId: string, userId: string): Promise<void> {
    const rsvp = await this.eventRsvpRepository.findOne({
      where: { id: rsvpId },
    });
    if (!rsvp) throw new NotFoundException('RSVP not found');
    if (rsvp.userId !== userId) {
      throw new ForbiddenException('You can only cancel your own RSVP');
    }

    await this.eventRsvpRepository.remove(rsvpId);
  }

  async getMyRsvp(eventId: string, userId: string): Promise<EventRsvp | null> {
    return this.eventRsvpRepository.findOne({ where: { eventId, userId } });
  }

  async getEventRsvps(
    eventId: string,
    actorId: string,
    page = 1,
    limit = 50,
    status?: RsvpStatus,
  ): Promise<{ rsvps: EventRsvp[]; total: number; attending: number }> {
    const event = await this.eventRepository.findOne({
      where: { id: eventId },
    });
    if (!event) throw new NotFoundException('Event not found');

    if (event.creatorId !== actorId) {
      throw new ForbiddenException(
        'Only organizers can view the full RSVP list',
      );
    }

    const qb = this.eventRsvpRepository
      .createQueryBuilder('rsvp')
      .leftJoinAndSelect('rsvp.user', 'user')
      .where('rsvp.eventId = :eventId', { eventId });

    if (status) {
      qb.andWhere('rsvp.status = :status', { status });
    }

    const [rsvps, total] = await qb
      .orderBy('rsvp.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const attending = await this.eventRsvpRepository
      .createQueryBuilder('rsvp')
      .select('SUM(rsvp.guest_count)', 'total')
      .where('rsvp.eventId = :eventId', { eventId })
      .andWhere('rsvp.status = :status', { status: RsvpStatus.VENUE })
      .getRawOne()
      .then((r) => Number(r?.total ?? 0));

    return { rsvps, total, attending };
  }

  async getMyRsvpEvents(
    userId: string,
    dto: GetMyRsvpEventsDto,
  ): Promise<{
    events: any[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const { status, rsvpStatus, page = 1, limit = 20 } = dto;
    const offset = (page - 1) * limit;

    const qb = this.eventRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.category', 'category')
      .leftJoin('event.creator', 'creator')
      .addSelect(['creator.id', 'creator.firstName', 'creator.lastName'])
      .innerJoinAndSelect(
        'event_rsvps',
        'rsvp',
        'rsvp.event_id = event.id AND rsvp.user_id = :userId AND rsvp.deleted_at IS NULL',
        { userId },
      )
      .where('event.isPublished = true');

    if (status) {
      qb.andWhere('event.status = :status', { status });
    }

    if (rsvpStatus) {
      qb.andWhere('rsvp.status = :rsvpStatus', { rsvpStatus });
    }

    const total = await qb.getCount();
    const raw = await qb
      .orderBy('rsvp.responded_at', 'DESC')
      .offset(offset)
      .limit(limit)
      .getRawAndEntities();

    const events = raw.entities.map((event, index) => {
      const r = raw.raw[index];
      return {
        ...this.shapeEventResponse(event),
        myRsvp: {
          rsvpId: r.rsvp_id,
          status: r.rsvp_status,
          guestCount: r.rsvp_guest_count,
          note: r.rsvp_note,
          respondedAt: r.rsvp_responded_at,
        },
      };
    });

    return { events, total, page, totalPages: Math.ceil(total / limit) };
  }

  async deleteAllEvents() {
    const events = await this.eventRepository.findAll();
    const eventIds = events.map((event) => event.id);

    if (eventIds.length > 0) {
      await this.eventOrganizerRepository.delete({ eventId: In(eventIds) });
      await this.eventContributionRepository.delete({ eventId: In(eventIds) });
      await this.eventRsvpRepository.delete({ eventId: In(eventIds) });

      await this.eventRepository.delete({ id: In(eventIds) });
    }
  }

  private async getPublishedEvent(eventId: string) {
    const event = await this.eventRepository.findOne({
      where: { id: eventId },
    });
    if (!event) throw new NotFoundException('Event not found');
    if (!event.isPublished) {
      throw new BadRequestException(
        'This event is not available for RSVP yet.',
      );
    }
    return event;
  }

  private assertEventAcceptsRsvp(event: any): void {
    if (event.status === EventStatus.CANCELLED) {
      throw new BadRequestException('This event has been cancelled.');
    }
    if (event.status === EventStatus.COMPLETED) {
      throw new BadRequestException('This event has already ended.');
    }
    if (event.startDateTime && new Date(event.startDateTime) < new Date()) {
      throw new BadRequestException(
        'This event has already started. RSVP is closed.',
      );
    }
  }

  async getListings(
    userId: string,
    dto: GetListingsDto,
  ): Promise<{
    listings: Listing[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const { eventId, creatorId, search, page = 1, limit = 20 } = dto;
    const offset = (page - 1) * limit;

    const qb = this.eventRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.creator', 'creator')
      .where('event.creatorId = :userId', { userId })
      .andWhere('event.isPublished = true')
      .andWhere('event.status = :status', { status: EventStatus.ACTIVE })
      .andWhere(`JSON_LENGTH(event.purchasable_items) > 0`);

    if (eventId) {
      qb.andWhere('event.id = :eventId', { eventId });
    }

    if (creatorId) {
      qb.andWhere('event.creatorId = :creatorId', { creatorId });
    }

    if (search) {
      qb.andWhere(
        `(event.name LIKE :search OR JSON_SEARCH(event.purchasable_items, 'one', :searchRaw) IS NOT NULL)`,
        { search: `%${search}%`, searchRaw: `%${search}%` },
      );
    }

    const events = await qb
      .orderBy('event.startDateTime', 'ASC')
      .skip(offset)
      .take(limit)
      .getMany();

    const listings: Listing[] = events.flatMap((event) =>
      (event.purchasableItems ?? []).map((item) => ({
        eventId: event.id,
        eventName: event.name,
        eventStartDateTime: event.startDateTime,
        eventStatus: event.status,
        shareLink: event.shareLink,
        creatorId: event.creatorId,
        creatorName: event.creator
          ? `${event.creator.firstName ?? ''} ${event.creator.lastName ?? ''}`.trim() ||
            event.creator.email
          : null,
        item: {
          name: item.name,
          price: item.price,
          images: item.images,
          quantity: item.quantity,
        },
      })),
    );

    const total = await qb.getCount();

    return {
      listings,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getEventListings(eventId: string): Promise<Listing[]> {
    const event = await this.eventRepository.findOne({
      where: { id: eventId, isPublished: true },
      relations: ['creator'],
    });

    if (!event) throw new NotFoundException('Event not found');

    return (event.purchasableItems ?? []).map((item) => ({
      eventId: event.id,
      eventName: event.name,
      eventStartDateTime: event.startDateTime,
      eventStatus: event.status,
      shareLink: event.shareLink,
      creatorId: event.creatorId,
      creatorName: event.creator
        ? `${event.creator.firstName ?? ''} ${event.creator.lastName ?? ''}`.trim() ||
          event.creator.email
        : null,
      item: {
        name: item.name,
        price: item.price,
        images: item.images,
        quantity: item.quantity,
      },
    }));
  }
}
