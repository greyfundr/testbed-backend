import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { Admin } from './entities/admin.entity';
import { AdminRepository } from './repository/admin.repository';
import { AdminService } from './services/admin.service';
import { AdminCampaignService } from './services/admin-campaign.service';
import { AdminAuthController } from './controllers/admin-auth.controller';
import { AdminCampaignController } from './controllers/admin-campaign.controller';
import { AdminJwtStrategy } from './strategies/admin-jwt.strategy';
import { CampaignModule } from '../campaign/campaign.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Admin]),
    PassportModule,
    CampaignModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'secretKey',
        signOptions: { expiresIn: '1d' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AdminAuthController, AdminCampaignController],
  providers: [
    AdminRepository,
    AdminService,
    AdminCampaignService,
    AdminJwtStrategy,
  ],
  exports: [AdminService, AdminRepository],
})
export class AdminModule {}
