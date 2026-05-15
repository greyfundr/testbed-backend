import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Campaign, CampaignVendor } from '../entities';
import {
  CreateVendorDto,
  UpdateVendorDto,
} from '../dto/campaign-vendor.dto';
import { CampaignVendorKind } from '../enums/campaign.enum';

@Injectable()
export class CampaignVendorService {
  constructor(
    @InjectRepository(CampaignVendor)
    private readonly vendorRepo: Repository<CampaignVendor>,
    @InjectRepository(Campaign)
    private readonly campaignRepo: Repository<Campaign>,
  ) {}

  async list(campaignId: string) {
    return this.vendorRepo.find({
      where: { campaignId },
      order: { createdAt: 'DESC' },
    });
  }

  private async assertCreator(campaignId: string, userId: string) {
    const c = await this.campaignRepo.findOne({
      where: { id: campaignId },
    });
    if (!c) throw new NotFoundException('Campaign not found');
    if (c.creatorId !== userId) {
      throw new ForbiddenException(
        'Only the campaign creator can manage vendors',
      );
    }
    return c;
  }

  async create(campaignId: string, userId: string, dto: CreateVendorDto) {
    await this.assertCreator(campaignId, userId);
    const v = this.vendorRepo.create({
      campaignId,
      name: dto.name,
      kind: dto.kind ?? CampaignVendorKind.VENDOR,
      bankName: dto.bankName ?? null,
      accountName: dto.accountName ?? null,
      accountNumber: dto.accountNumber ?? null,
      contact: dto.contact ?? null,
      notes: dto.notes ?? null,
    });
    return this.vendorRepo.save(v);
  }

  async createMany(
    campaignId: string,
    userId: string,
    dtos: CreateVendorDto[],
  ) {
    await this.assertCreator(campaignId, userId);
    if (!dtos.length) return [];
    const entities = dtos.map((dto) =>
      this.vendorRepo.create({
        campaignId,
        name: dto.name,
        kind: dto.kind ?? CampaignVendorKind.VENDOR,
        bankName: dto.bankName ?? null,
        accountName: dto.accountName ?? null,
        accountNumber: dto.accountNumber ?? null,
        contact: dto.contact ?? null,
        notes: dto.notes ?? null,
      }),
    );
    return this.vendorRepo.save(entities);
  }

  async update(vendorId: string, userId: string, dto: UpdateVendorDto) {
    const v = await this.vendorRepo.findOne({
      where: { id: vendorId },
      relations: ['campaign'],
    });
    if (!v) throw new NotFoundException('Vendor not found');
    if (v.campaign.creatorId !== userId) {
      throw new ForbiddenException('Only the campaign creator can edit');
    }
    if (dto.name !== undefined) v.name = dto.name;
    if (dto.kind !== undefined) v.kind = dto.kind;
    if (dto.bankName !== undefined) v.bankName = dto.bankName;
    if (dto.accountName !== undefined) v.accountName = dto.accountName;
    if (dto.accountNumber !== undefined) v.accountNumber = dto.accountNumber;
    if (dto.contact !== undefined) v.contact = dto.contact;
    if (dto.notes !== undefined) v.notes = dto.notes;
    return this.vendorRepo.save(v);
  }

  async remove(vendorId: string, userId: string) {
    const v = await this.vendorRepo.findOne({
      where: { id: vendorId },
      relations: ['campaign'],
    });
    if (!v) throw new NotFoundException('Vendor not found');
    if (v.campaign.creatorId !== userId) {
      throw new ForbiddenException('Only the campaign creator can remove');
    }
    await this.vendorRepo.remove(v);
    return { success: true };
  }
}
