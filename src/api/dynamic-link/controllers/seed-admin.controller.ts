import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamicLinkProjectRepository } from '../repository';
import {
  AndroidConfig,
  DynamicLinkProject,
  IosConfig,
} from '../entities/dynamic-link-project.entity';

// One-shot admin endpoint used to populate `dynamic_link_projects`
// with the testbed's iOS team-id and Android keystore SHA256 so the
// `/.well-known/apple-app-site-association` and `assetlinks.json`
// payloads stop being empty and the OS-level deep-link verification
// can succeed against this build of the app.
//
// Guarded by a header `x-admin-secret` that must equal the env var
// `ADMIN_ONE_SHOT_TOKEN`. Once the row is seeded, this file should
// be deleted in a follow-up PR (the controller class + its line in
// the module's controllers array — that's all).
//
// Idempotent: calling twice with the same SHA doesn't duplicate the
// fingerprint in the array.

type SeedBody = {
  androidSha256?: string;
  ios?: Partial<IosConfig>;
};

@Controller('admin/dynamic-link-project')
export class SeedAdminController {
  constructor(
    private readonly projectRepo: DynamicLinkProjectRepository,
    private readonly config: ConfigService,
  ) {}

  @Post('seed')
  @HttpCode(HttpStatus.OK)
  async seed(
    @Headers('x-admin-secret') secret: string | undefined,
    @Body() body: SeedBody,
  ): Promise<{ ok: true; ios: IosConfig | null; android: AndroidConfig | null }> {
    const expected = this.config.get<string>('ADMIN_ONE_SHOT_TOKEN');
    if (!expected) {
      // Env var not set on the server → endpoint is locked.
      throw new ServiceUnavailableException(
        'Admin one-shot token not configured',
      );
    }
    if (!secret || secret !== expected) {
      throw new ForbiddenException('Invalid admin secret');
    }

    // Find the one active project row. If multiple exist we update
    // every active one (rare; safe in practice because there's
    // typically a single project per environment).
    const projects = await this.projectRepo.findAll({
      where: { isActive: true },
    });
    if (!projects.length) {
      throw new ServiceUnavailableException(
        'No active DynamicLinkProject row found. Insert one before seeding.',
      );
    }

    let lastIos: IosConfig | null = null;
    let lastAndroid: AndroidConfig | null = null;

    for (const project of projects) {
      const updated: Partial<DynamicLinkProject> = {};

      // ── iOS — merge any provided fields onto the existing JSON.
      if (body.ios) {
        const merged: IosConfig = {
          bundleId: body.ios.bundleId ?? project.ios?.bundleId ?? '',
          teamId: body.ios.teamId ?? project.ios?.teamId ?? '',
          appStoreUrl:
            body.ios.appStoreUrl ?? project.ios?.appStoreUrl ?? '',
        };
        updated.ios = merged;
      }

      // ── Android — prepend the SHA if it's not already in the array.
      if (body.androidSha256) {
        const sha = body.androidSha256.trim().toUpperCase();
        const existing = project.android?.sha256CertFingerprints ?? [];
        const already = existing.some((s) => s.toUpperCase() === sha);
        const next: AndroidConfig = {
          packageName: project.android?.packageName ?? 'com.greyfundr.android',
          playStoreUrl: project.android?.playStoreUrl ?? '',
          sha256CertFingerprints: already ? existing : [sha, ...existing],
        };
        updated.android = next;
      }

      if (Object.keys(updated).length > 0) {
        await this.projectRepo.update(project.id, updated);
      }

      const fresh = await this.projectRepo.findOne({
        where: { id: project.id },
      });
      lastIos = fresh?.ios ?? null;
      lastAndroid = fresh?.android ?? null;
    }

    return { ok: true, ios: lastIos, android: lastAndroid };
  }
}
