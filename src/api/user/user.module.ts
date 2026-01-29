import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsService, UserService } from './services';
import { UserController, SettingsController } from './controllers';
import { User, Settings } from './entities';
import { SettingsRepository, UserRepository } from './repository';

@Module({
  imports: [TypeOrmModule.forFeature([User, Settings])],
  controllers: [UserController, SettingsController],
  providers: [UserService, UserRepository, SettingsService, SettingsRepository],
  exports: [UserService, UserRepository, SettingsService, SettingsRepository],
})
export class UserModule {}
