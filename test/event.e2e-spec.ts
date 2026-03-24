import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
const request = require('supertest');
import { AppModule } from './../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../src/api/user/entities/user.entity';
import { Wallet } from '../src/api/wallet/entities/wallet.entity';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AccountType } from '../src/api/user/enums/user.enum';
import { WalletCurrency } from '../src/api/wallet/enums/wallet.enum';
import { Event, EventCategory, EventContribution } from '../src/api/event/entities';
import { EventContributionType } from '../src/api/event/enums/event.enum';

describe('Event Module APIs (e2e)', () => {
  jest.setTimeout(60000);
  let app: INestApplication;
  let jwtService: JwtService;
  let userRepository: Repository<User>;
  let walletRepository: Repository<Wallet>;
  let eventRepository: Repository<Event>;
  let categoryRepository: Repository<EventCategory>;
  let contributionRepository: Repository<EventContribution>;

  let userToken: string;
  let testUser: User;
  let testCategoryId: string;
  let testEventId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
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

    // Cleanup
    try {
      await contributionRepository.delete({});
      await eventRepository.delete({});
      await categoryRepository.delete({});
      await walletRepository.delete({});
      await userRepository.delete({});
    } catch (e) {}

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
      availableBalance: 100000000, // 1,000,000 Naira (100,000,000 kobo)
      ledgerBalance: 100000000,
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
    try {
      await contributionRepository.delete({});
      await eventRepository.delete({});
      await categoryRepository.delete({});
      await walletRepository.delete({});
      await userRepository.delete({});
    } catch (e) {}
    await app.close();
  });

  it('/events (POST) - Create an event', async () => {
    const res = await request(app.getHttpServer())
      .post('/events')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        title: 'Tech Conference 2026',
        shortDescription: 'A big tech event',
        detailedDescription: {
          text: 'Detailed description of the tech event',
          media: ['https://example.com/image.jpg'],
        },
        categoryId: testCategoryId,
        location: {
          lat: 6.5244,
          lng: 3.3792,
          address: 'Lagos, Nigeria',
        },
        hashtag: 'TECH2026',
        targetAmount: 500000, // 500,000 Naira
        eventTime: new Date(Date.now() + 86400000 * 7).toISOString(),
        venueName: 'Lagos Arena',
        expectedParticipants: 100,
        organizers: [
          {
            userId: testUser.id,
            role: 'owner',
          },
        ],
      });

    expect(res.status).toBe(201);
    testEventId = res.body.id;
    expect(res.body.title).toBe('Tech Conference 2026');
    // Obsereved behavior in this project: the response returns amount divided by 100.
    // 500,000 / 100 = 5000.
    expect(Number(res.body.targetAmount)).toBe(5000); 
  });

  it('/events (GET) - Get all events', async () => {
    const res = await request(app.getHttpServer())
      .get('/events')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('/events/:id (GET) - Get event details', async () => {
    const res = await request(app.getHttpServer())
      .get(`/events/${testEventId}`)
      .expect(200);

    expect(res.body.id).toBe(testEventId);
    expect(res.body.title).toBe('Tech Conference 2026');
  });

  it('/events/:id/contribute (POST) - Donate to event', async () => {
    const res = await request(app.getHttpServer())
      .post(`/events/${testEventId}/contribute`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        type: EventContributionType.DONATION,
        amount: 50000, // 500 Naira
        details: { message: 'Supporting the event' },
      });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe(EventContributionType.DONATION);
    expect(Number(res.body.amount)).toBe(500);
  });

  it('/events/:id/contribute (POST) - Purchase item from event', async () => {
    const res = await request(app.getHttpServer())
      .post(`/events/${testEventId}/contribute`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        type: EventContributionType.PURCHASE,
        amount: 20000, // 200 Naira
        details: { itemName: 'T-Shirt', quantity: 1 },
      });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe(EventContributionType.PURCHASE);
    expect(Number(res.body.amount)).toBe(200);
  });

  it('/events/:id/leaderboard (GET) - Get leaderboard', async () => {
    const res = await request(app.getHttpServer())
      .get(`/events/${testEventId}/leaderboard`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(Number(res.body[0].totalAmount)).toBeGreaterThan(0);
  });
});
