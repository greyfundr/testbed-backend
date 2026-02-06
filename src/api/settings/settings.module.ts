import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsService } from './services';
import { SettingsController } from './controllers';
import { Settings } from './entities';
import { SettingsRepository } from './repository';

@Module({
    imports: [TypeOrmModule.forFeature([Settings])],
    controllers: [SettingsController],
    providers: [SettingsService, SettingsRepository],
    exports: [SettingsService, SettingsRepository],
})
export class SettingsModule { }
