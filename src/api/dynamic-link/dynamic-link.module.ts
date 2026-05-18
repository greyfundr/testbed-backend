import { Module } from '@nestjs/common';
import { DynamicLinkService } from './services/dynamic-link.service';
import { DynamicLinkController } from './controllers/dynamic-link.controller';
import { DynamicLink, DynamicLinkProject } from './entities';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  DynamicLinkProjectRepository,
  DynamicLinkRepository,
} from './repository';
import { DynamicLinkRedirectController } from './controllers/dynamic-link-redirect.controller';
import { SeedAdminController } from './controllers/seed-admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([DynamicLink, DynamicLinkProject])],
  providers: [
    DynamicLinkService,
    DynamicLinkRepository,
    DynamicLinkProjectRepository,
  ],
  exports: [DynamicLinkService],
  controllers: [
    DynamicLinkController,
    DynamicLinkRedirectController,
    // One-shot admin endpoint for seeding the well-known files'
    // iOS team-id / Android SHA256. Delete once the row is seeded —
    // remove this line + delete `controllers/seed-admin.controller.ts`.
    SeedAdminController,
  ],
})
export class DynamicLinkModule {}
