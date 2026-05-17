import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PointsRule, UserPointsEvent } from './entities';
import { PointsService } from './services/points.service';
import { PointsController } from './controllers/points.controller';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PointsRule, UserPointsEvent]),
    forwardRef(() => SettingsModule),
  ],
  controllers: [PointsController],
  providers: [PointsService],
  exports: [PointsService],
})
export class PointsModule {}
