import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
const request = require('supertest');
import { AppModule } from './../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../src/api/user/entities/user.entity';
import { Campaign } from '../src/api/campaign/entities/campaign.entity';
import { Admin } from '../src/api/admin/entities/admin.entity';
import { Wallet } from '../src/api/wallet/entities/wallet.entity';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { CampaignCategory } from '../src/api/campaign/enums/campaign.enum';
import { AccountType } from '../src/api/user/enums/user.enum';
import { WalletCurrency } from '../src/api/wallet/enums/wallet.enum';

describe('Campaign Module APIs (e2e)', () => {
  jest.setTimeout(60000); // Wait up to 60s for bootstrap and hooks
  let app: INestApplication;
  let jwtService: JwtService;
  let userRepository: Repository<User>;
  let campaignRepository: Repository<Campaign>;
  let adminRepository: Repository<Admin>;
  let walletRepository: Repository<Wallet>;

  let userToken: string;
  let adminToken: string;
  let testUser: User;
  let testCampaignId: string;

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
    campaignRepository = moduleFixture.get(getRepositoryToken(Campaign));
    adminRepository = moduleFixture.get(getRepositoryToken(Admin));
    walletRepository = moduleFixture.get(getRepositoryToken(Wallet));

    // Cleanup first
    try {
      await campaignRepository.delete({});
    } catch (e) {}
    try {
      await walletRepository.delete({});
    } catch (e) {}
    try {
      await userRepository.delete({});
    } catch (e) {}
    try {
      await adminRepository.delete({});
    } catch (e) {}

    // Create User
    const uniqueSuffix = Date.now().toString();
    testUser = userRepository.create({
      email: `testdonor+${uniqueSuffix}@example.com`,
      phoneNumber: `+234${uniqueSuffix.slice(-10)}`,
      password: await bcrypt.hash('password123', 10),
      firstName: 'Test',
      lastName: 'Donor',
      accountType: AccountType.PERSONAL,
      hasVerifiedPhone: true,
    });
    await userRepository.save(testUser);

    // Create Wallet for Donation
    const wallet = walletRepository.create({
      userId: testUser.id,
      availableBalance: 1000000,
      ledgerBalance: 1000000,
      currency: WalletCurrency.NGN,
    });
    await walletRepository.save(wallet);

    userToken = await jwtService.signAsync({
      sub: testUser.id,
      email: testUser.email,
    });

    // Create Admin
    const admin = adminRepository.create({
      email: `testadmin+${Date.now()}@example.com`,
      password: await bcrypt.hash('admin123', 10),
      firstName: 'Admin',
      lastName: 'User',
    });
    await adminRepository.save(admin);

    adminToken = await jwtService.signAsync({
      sub: admin.id,
      email: admin.email,
      type: 'admin',
    });
  });

  afterAll(async () => {
    try {
      await campaignRepository.delete({});
    } catch (e) {}
    try {
      await walletRepository.delete({});
    } catch (e) {}
    try {
      await userRepository.delete({});
    } catch (e) {}
    try {
      await adminRepository.delete({});
    } catch (e) {}
    await app.close();
  });

  it('/campaigns (POST) - Create a campaign', async () => {
    const res = await request(app.getHttpServer())
      .post('/campaigns')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        title: 'Save the Turtles',
        description: 'Rescue sea turtles.',
        category: CampaignCategory.MEDICAL,
        target: 500000,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 86400000).toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Save the Turtles');
    expect(res.body.target).toBe(5000);
    testCampaignId = res.body.id;
  });

  it('/admin/campaigns/:id/approve (PATCH) - Approve campaign', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/admin/campaigns/${testCampaignId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('active');
  });

  it('/campaigns (GET) - Get all campaigns', async () => {
    const res = await request(app.getHttpServer())
      .get('/campaigns')
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('/campaigns/my-campaigns (GET) - Get my campaigns', async () => {
    const res = await request(app.getHttpServer())
      .get('/campaigns/my-campaigns')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].id).toBe(testCampaignId);
  });

  it('/campaigns/:id (PATCH) - Update campaign', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/campaigns/${testCampaignId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        title: 'Save the Turtles V2',
      })
      .expect(200);

    expect(res.body.title).toBe('Save the Turtles V2');
  });

  it('/campaigns/:id (GET) - Get one campaign', async () => {
    const res = await request(app.getHttpServer())
      .get(`/campaigns/${testCampaignId}`)
      .expect(200);

    expect(res.body.id).toBe(testCampaignId);
    expect(res.body.title).toBe('Save the Turtles V2');
  });

  it('/campaigns/:id/donate (POST) - Donate to campaign', async () => {
    const res = await request(app.getHttpServer())
      .post(`/campaigns/${testCampaignId}/donate`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        amount: 50000, // 50000 kobo
        isAnonymous: false,
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });

  it('/campaigns/:id/donations (GET) - Get donations', async () => {
    const res = await request(app.getHttpServer())
      .get(`/campaigns/${testCampaignId}/donations`)
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });
});
