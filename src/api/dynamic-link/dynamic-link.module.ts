import { Module } from '@nestjs/common';
import { DynamicLinkService } from './services/dynamic-link.service';
import { DynamicLinkController } from './controllers/dynamic-link.controller';
import { DynamicLink, DynamicLinkProject } from './entities';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  DynamicLinkProjectRepository,
  DynamicLinkRepository,
} from './repository';

@Module({
  imports: [TypeOrmModule.forFeature([DynamicLink, DynamicLinkProject])],
  providers: [
    DynamicLinkService,
    DynamicLinkRepository,
    DynamicLinkProjectRepository,
  ],
  exports: [DynamicLinkService],
  controllers: [DynamicLinkController],
})
export class DynamicLinkModule {}
