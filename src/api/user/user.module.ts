import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  UserService,
  KycService,
  FriendRequestService,
  FollowService,
  BlockService,
} from './services';
import {
  UserController,
  KycController,
  FriendRequestController,
  FollowController,
  BlockController,
} from './controllers';
import { User, Profile, Kyc, FriendRequest, Follow, Block } from './entities';
import { UserRepository, ProfileRepository, KycRepository } from './repository';
import { SettingsModule } from '../settings/settings.module';
import { NotificationModule } from '../notification/notification.module';
import { UserKycService } from 'src/common/services/kyc-verification.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Profile,
      Kyc,
      FriendRequest,
      Follow,
      Block,
    ]),
    SettingsModule,
    forwardRef(() => NotificationModule),
  ],
  controllers: [
    UserController,
    KycController,
    FriendRequestController,
    FollowController,
    BlockController,
  ],
  providers: [
    UserService,
    KycService,
    UserRepository,
    ProfileRepository,
    KycRepository,
    UserKycService,
    FriendRequestService,
    FollowService,
    BlockService,
  ],
  exports: [
    UserService,
    KycService,
    UserRepository,
    ProfileRepository,
    KycRepository,
    FriendRequestService,
    FollowService,
    BlockService,
  ],
})
export class UserModule {}
