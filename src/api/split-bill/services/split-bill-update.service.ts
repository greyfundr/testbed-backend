import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SplitBill, SplitBillUpdate } from '../entities';
import { User } from '../../user/entities';
import {
  CreateSplitBillUpdateDto,
  SplitBillUpdateResponseDto,
} from '../dtos/split-bill-update.dto';

// Creator-only "announcements" feed for a split bill. Mirrors the
// campaign Updates service. Participants can read but not post —
// they raise their voice through Comments / Governance instead.
@Injectable()
export class SplitBillUpdateService {
  constructor(
    @InjectRepository(SplitBillUpdate)
    private readonly updateRepo: Repository<SplitBillUpdate>,
    @InjectRepository(SplitBill)
    private readonly billRepo: Repository<SplitBill>,
  ) {}

  async list(billId: string): Promise<SplitBillUpdateResponseDto[]> {
    const rows = await this.updateRepo.find({
      where: { splitBillId: billId },
      relations: ['author'],
      order: { pinned: 'DESC', createdAt: 'DESC' },
    });
    return rows.map((u) => this.toDto(u));
  }

  async create(
    billId: string,
    user: User,
    dto: CreateSplitBillUpdateDto,
  ): Promise<SplitBillUpdateResponseDto> {
    const bill = await this.billRepo.findOne({ where: { id: billId } });
    if (!bill) throw new NotFoundException('Bill not found');
    if (bill.creatorId !== user.id) {
      throw new ForbiddenException(
        'Only the bill creator can post an update',
      );
    }
    const saved = await this.updateRepo.save(
      this.updateRepo.create({
        splitBillId: billId,
        authorId: user.id,
        body: dto.body.trim(),
        pinned: dto.pinned ?? false,
      }),
    );
    const withAuthor = await this.updateRepo.findOne({
      where: { id: saved.id },
      relations: ['author'],
    });
    return this.toDto(withAuthor as SplitBillUpdate);
  }

  private toDto(u: SplitBillUpdate): SplitBillUpdateResponseDto {
    const a = u.author;
    return {
      id: u.id,
      splitBillId: u.splitBillId,
      body: u.body,
      pinned: !!u.pinned,
      createdAt: u.createdAt,
      author: {
        id: a?.id ?? u.authorId,
        firstName: a?.firstName ?? undefined,
        lastName: a?.lastName ?? undefined,
        profileImage: (a as { profile?: { image?: string } })?.profile?.image,
      },
    };
  }
}
