import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { nanoid } from 'nanoid';
import { DynamicLink, DynamicLinkType, DynamicLinkProject } from '../entities';
import { ConfigService } from '@nestjs/config';
import {
  DynamicLinkProjectRepository,
  DynamicLinkRepository,
} from '../repository';
import {
  CreateDynamicLinkProjectDto,
  UpdateDynamicLinkProjectDto,
} from '../dtos/dynamic-link.dto';

export interface GenerateLinkOptions {
  type: DynamicLinkType;
  resourceId: string;
  metadata?: Record<string, string>;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
}

export interface GeneratedLink {
  shortUrl: string;
  shortCode: string;
}

@Injectable()
export class DynamicLinkService implements OnModuleInit {
  private readonly logger = new Logger(DynamicLinkService.name);
  private project: DynamicLinkProject | null = null;

  constructor(
    private readonly linkRepo: DynamicLinkRepository,
    private readonly projectRepo: DynamicLinkProjectRepository,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.reloadProject();
  }

  async reloadProject(): Promise<void> {
    this.project = await this.projectRepo.findOne({
      where: { name: 'Greyfundr', isActive: true },
    });

    if (!this.project) {
      this.logger.warn(
        '[DynamicLinkService] No active Greyfundr project found.',
      );
    } else {
      this.logger.log(
        `[DynamicLinkService] Project loaded: ${this.project.id} ✅`,
      );
    }
  }

  async create(dto: CreateDynamicLinkProjectDto) {
    const exists = await this.projectRepo.findOne({
      where: { name: dto.name },
    });

    if (exists) {
      throw new ConflictException(
        `A project named "${dto.name}" already exists.`,
      );
    }

    const newProject = await this.projectRepo.create({
      name: dto.name,
      appScheme: dto.appScheme,
      ios: dto.ios,
      android: dto.android,
      isActive: dto.isActive ?? true,
    });

    const project = await this.projectRepo.save(newProject);

    await this.reloadProject();

    return project;
  }

  async activate(id: string): Promise<DynamicLinkProject> {
    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    project.isActive = true;
    const saved = await this.projectRepo.save(project);
    await this.reloadProject(); // ✅ refresh cache
    return saved;
  }

  async deactivate(id: string): Promise<DynamicLinkProject> {
    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    project.isActive = false;
    const saved = await this.projectRepo.save(project);
    await this.reloadProject(); // ✅ refresh cache
    return saved;
  }

  async update(
    id: string,
    dto: UpdateDynamicLinkProjectDto,
  ): Promise<DynamicLinkProject> {
    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (dto.name && dto.name !== project.name) {
      const nameExists = await this.projectRepo.findOne({
        where: { name: dto.name },
      });
      if (nameExists) {
        throw new ConflictException(
          `A project named "${dto.name}" already exists.`,
        );
      }
    }

    Object.assign(project, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.appScheme !== undefined && { appScheme: dto.appScheme }),
      ...(dto.ios !== undefined && { ios: dto.ios }),
      ...(dto.android !== undefined && { android: dto.android }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    });

    const saved = await this.projectRepo.save(project);
    await this.reloadProject();
    return saved;
  }

  async generate(options: GenerateLinkOptions): Promise<GeneratedLink> {
    if (!this.project) {
      this.logger.warn(
        '[DynamicLinkService] No project — skipping link generation.',
      );
      return { shortUrl: '', shortCode: '' };
    }

    try {
      const existing = await this.linkRepo.findOne({
        where: { type: options.type, resourceId: options.resourceId },
      });

      if (existing) {
        return {
          shortUrl: this.buildShortUrl(existing.shortCode),
          shortCode: existing.shortCode,
        };
      }

      const shortCode = nanoid(10);

      const link = await this.linkRepo.save(
        await this.linkRepo.create({
          projectId: this.project.id,
          shortCode,
          type: options.type,
          resourceId: options.resourceId,
          metadata: options.metadata ?? null,
          customOgTitle: options.ogTitle ?? null,
          customOgDescription: options.ogDescription ?? null,
          customOgImage: options.ogImage ?? null,
        }),
      );

      return {
        shortUrl: this.buildShortUrl(link.shortCode),
        shortCode: link.shortCode,
      };
    } catch (err) {
      this.logger.error(
        `[DynamicLinkService] Failed to generate link for ${options.type}:${options.resourceId}`,
        err,
      );
      return { shortUrl: '', shortCode: '' };
    }
  }

  async forEvent(eventId: string, eventName?: string): Promise<GeneratedLink> {
    return this.generate({
      type: 'event',
      resourceId: eventId,
      ogTitle: eventName
        ? `${eventName} — GreyFundr`
        : "You're invited to an event",
      ogDescription: 'Tap to view event details and RSVP.',
    });
  }

  async forCampaign(
    campaignId: string,
    shareSlug: string,
    title?: string,
  ): Promise<GeneratedLink> {
    return this.generate({
      type: 'campaign',
      resourceId: campaignId,
      metadata: { slug: shareSlug },
      ogTitle: title
        ? `Support "${title}" on GreyFundr`
        : 'Support this campaign',
      ogDescription: 'Every contribution counts. Tap to donate.',
    });
  }

  async forSplitBill(
    billId: string,
    billTitle?: string,
  ): Promise<GeneratedLink> {
    return this.generate({
      type: 'split_bill',
      resourceId: billId,
      ogTitle: billTitle
        ? `Split bill: ${billTitle}`
        : 'You have a pending split bill',
      ogDescription: 'Tap to view and pay your share.',
    });
  }

  async forSplitBillInvite(
    billId: string,
    inviteCode: string,
    billTitle?: string,
  ): Promise<GeneratedLink> {
    return this.generate({
      type: 'invite',
      resourceId: billId,
      metadata: { inviteCode },
      ogTitle: billTitle
        ? `Pay your share: ${billTitle}`
        : 'Your share is waiting',
      ogDescription: 'Open GreyFundr to complete your payment.',
    });
  }

  async resolveAndTrack(
    shortCode: string,
  ): Promise<{ link: DynamicLink; project: DynamicLinkProject }> {
    const link = await this.linkRepo.findOne({
      where: { shortCode },
      relations: ['project'],
    });

    if (!link) throw new NotFoundException('Link not found');

    // this.linkRepo.increment({ id: link.id }, 'clicks', 1).catch(() => null);

    return { link, project: link.project };
  }

  private buildShortUrl(shortCode: string): string {
    const baseUrl = this.config.getOrThrow<string>('API_BASE_URL');
    return `${baseUrl}/l/${shortCode}`;
  }
}
