import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
const request = require('supertest');
import { AppModule } from './../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../src/api/user/entities/user.entity';
import { Wallet } from '../src/api/wallet/entities/wallet.entity';
import { Repository, DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AccountType } from '../src/api/user/enums/user.enum';
import { WalletCurrency } from '../src/api/wallet/enums/wallet.enum';
import { Event, EventCategory, EventContribution } from '../src/api/event/entities';
import { EventContributionType, EventPaymentMethod } from '../src/api/event/enums/event.enum';
import { PaymentService } from '../src/api/payment/services/payment.service';

describe('Event Module APIs (e2e)', () => {
  jest.setTimeout(60000);
  let app: INestApplication;
  let jwtService: JwtService;
  let userRepository: Repository<User>;
  let walletRepository: Repository<Wallet>;
  let eventRepository: Repository<Event>;
  let categoryRepository: Repository<EventCategory>;
  let contributionRepository: Repository<EventContribution>;
  let dataSource: DataSource;

  let userToken: string;
  let testUser: User;
  let testCategoryId: string;
  let testEventId: string;

  const mockPaymentService = {
    verifyWebhookSignature: jest.fn().mockReturnValue(true),
    initiateTransactions: jest.fn().mockResolvedValue({
      status: true,
      data: {
        authorization_url: 'https://checkout.paystack.com/test-url',
        reference: 'TEST-REF-123',
      },
    }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PaymentService)
      .useValue(mockPaymentService)
      .compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);
    userRepository = moduleFixture.get(getRepositoryToken(User));
    walletRepository = moduleFixture.get(getRepositoryToken(Wallet));
    eventRepository = moduleFixture.get(getRepositoryToken(Event));
    categoryRepository = moduleFixture.get(getRepositoryToken(EventCategory));
    contributionRepository = moduleFixture.get(getRepositoryToken(EventContribution));
    dataSource = moduleFixture.get(DataSource);

    // Cleanup
    await dataSource.query('SET FOREIGN_KEY_CHECKS = 0');
    await contributionRepository.createQueryBuilder().delete().execute();
    await eventRepository.createQueryBuilder().delete().execute();
    await categoryRepository.createQueryBuilder().delete().execute();
    await walletRepository.createQueryBuilder().delete().execute();
    await userRepository.createQueryBuilder().delete().execute();
    await dataSource.query('SET FOREIGN_KEY_CHECKS = 1');

    // Create User
    const uniqueSuffix = Date.now().toString();
    testUser = userRepository.create({
      email: `testevent+${uniqueSuffix}@example.com`,
      phoneNumber: `+234${uniqueSuffix.slice(-10)}`,
      password: await bcrypt.hash('password123', 10),
      firstName: 'Event',
      lastName: 'Tester',
      accountType: AccountType.PERSONAL,
      hasVerifiedPhone: true,
    });
    await userRepository.save(testUser);

    // Create Wallet
    const wallet = walletRepository.create({
      userId: testUser.id,
      availableBalance: 100000, // 1,000 Naira (100,000 kobo)
      ledgerBalance: 100000,
      currency: WalletCurrency.NGN,
    });
    await walletRepository.save(wallet);

    userToken = await jwtService.signAsync({
      sub: testUser.id,
      email: testUser.email,
    });

    // Create Category
    const category = categoryRepository.create({
      name: `Test Category ${uniqueSuffix}`,
      isActive: true,
    });
    const savedCategory = await categoryRepository.save(category);
    testCategoryId = savedCategory.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/v1/events (POST) - Create an event', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: 'Super Fest',
        hashtag: '#superfest2026',
        shortDescription: 'Best fest ever.',
        category: 'Party',
        coverImages: ['https://example.com/img1.png'],
        startDateTime: new Date(Date.now() + 86400000).toISOString(),
        startTime: '10:00 AM',
        spanMultipleDays: true,
        endDateTime: new Date(Date.now() + 86400000 * 3).toISOString(),
        organizers: [
          {
            name: 'Jane',
            number: '+1234567890',
          },
        ],
        detailedDescription: [
          {
            text: 'A fun paragraph.',
            media: ['https://example.com/detail1.png'],
          },
        ],
        location: {
          lat: 6.5244,
          lng: 3.3792,
          address: '123 Event Street, Lagos',
          venueName: 'Convention Center',
          locationDescription: 'Park in the back',
        },
        financing: {
          targetAmount: 10000,
          expectedParticipants: 500,
          acceptDonations: true,
          purchasableItems: [
            {
              name: 'VIP Ticket',
              images: ['https://example.com/merch.png'],
              price: 50,
              quantity: 100,
            },
          ],
          activities: [
            {
              name: 'Cake Cutting',
              image: 'https://example.com/activity.png',
              description: 'Delicious stuff',
              targetAmount: 500,
              time: new Date(Date.now() + 86400000 + 3600000).toISOString(),
            },
          ],
        },
      });

    expect(res.status).toBe(201);
    testEventId = res.body.id;
    expect(res.body.name).toBe('Super Fest');
  });

  it('/api/v1/events/:id/contribute (POST) - Wallet Contribution (Immediate)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/events/${testEventId}/contribute`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        type: EventContributionType.DONATION,
        amount: 500, // 500 Naira
        paymentMethod: EventPaymentMethod.WALLET,
        details: { message: 'Supporting via wallet' },
      });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe(EventContributionType.DONATION);
    expect(Number(res.body.amount)).toBe(500);
  });

  it('/api/v1/events/:id/contribute (POST) - Paystack Initiation', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/events/${testEventId}/contribute`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        type: EventContributionType.DONATION,
        amount: 1000, // 1000 Naira
        paymentMethod: EventPaymentMethod.PAYSTACK,
        details: { message: 'Supporting via paystack' },
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe(true);
    expect(res.body.data.authorization_url).toBeDefined();
    expect(mockPaymentService.initiateTransactions).toHaveBeenCalled();
  });

  it('/api/v1/payment/webhook (POST) - Paystack Webhook Finalization', async () => {
    const webhookPayload = {
      event: 'charge.success',
      data: {
        reference: 'PAY-REF-EVENT-123',
        amount: 100000, // 1000 Naira in kobo
        paid_at: new Date().toISOString(),
        channel: 'card',
        customer: {
          email: testUser.email,
          customer_code: 'CUS_mock_123',
        },
        metadata: {
          purpose: 'EVENT_CONTRIBUTION',
          eventId: testEventId,
          userId: testUser.id,
          contributeDto: {
            type: EventContributionType.DONATION,
            amount: 1000,
            details: { message: 'Supporting via paystack webhook' },
          },
        },
      },
    };

    const res = await request(app.getHttpServer())
      .post('/api/v1/payment/webhook')
      .set('x-paystack-signature', 'valid_mock_signature')
      .send(webhookPayload);

    expect(res.status).toBe(200);

    // Wait a bit for async processing
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Verify contribution record exists
    const contribution = await contributionRepository.findOne({
      where: { eventId: testEventId, userId: testUser.id, amount: 1000 },
    });
    expect(contribution).toBeDefined();
    if (contribution) {
      expect(Number(contribution.amount)).toBe(1000);
    }
  });
});
