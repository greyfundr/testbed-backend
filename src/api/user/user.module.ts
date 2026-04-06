import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserService, KycService } from './services';
import { UserController, KycController } from './controllers';
import { User, Profile, Kyc } from './entities';
import { UserRepository, ProfileRepository, KycRepository } from './repository';
import { SettingsModule } from '../settings/settings.module';
import { UserKycService } from 'src/common/services/kyc-verification.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Profile, Kyc]), SettingsModule],
  controllers: [UserController, KycController],
  providers: [
    UserService,
    KycService,
    UserRepository,
    ProfileRepository,
    KycRepository,
    UserKycService
  ],
  exports: [
    UserService,
    KycService,
    UserRepository,
    ProfileRepository,
    KycRepository,
  ],
})
export class UserModule {}
