import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SplitBill,
  SplitBillParticipant,
  SplitBillProposal,
  SplitBillProposalVote,
  SplitBillVendor,
} from '../entities';
import {
  SplitBillProposalStatus,
  SplitBillProposalVoteValue,
} from '../enums/split-bill.enum';
import {
  CastSplitBillProposalVoteDto,
  CreateSplitBillProposalDto,
  CreateSplitBillVendorDto,
} from '../dtos/split-bill-governance.dto';

// Governance for split bills. Mirrors the campaign-side flow but
// simplified: every participant votes directly, threshold is a
// simple majority (`ceil(n/2)`, min 1), and the proposal flips to
// approved / rejected as soon as the math is decided.
@Injectable()
export class SplitBillGovernanceService {
  constructor(
    @InjectRepository(SplitBill)
    private readonly billRepo: Repository<SplitBill>,
    @InjectRepository(SplitBillParticipant)
    private readonly participantRepo: Repository<SplitBillParticipant>,
    @InjectRepository(SplitBillVendor)
    private readonly vendorRepo: Repository<SplitBillVendor>,
    @InjectRepository(SplitBillProposal)
    private readonly proposalRepo: Repository<SplitBillProposal>,
    @InjectRepository(SplitBillProposalVote)
    private readonly voteRepo: Repository<SplitBillProposalVote>,
  ) {}

  // ─── Vendors ───────────────────────────────────────────────
  async listVendors(billId: string, viewerId: string) {
    await this.assertViewer(billId, viewerId);
    return this.vendorRepo.find({
      where: { splitBillId: billId },
      order: { createdAt: 'DESC' },
    });
  }

  async createVendor(
    billId: string,
    userId: string,
    dto: CreateSplitBillVendorDto,
  ) {
    await this.assertCreatorOrParticipant(billId, userId);
    const v = this.vendorRepo.create({
      splitBillId: billId,
      name: dto.name.trim(),
      kind: dto.kind,
      bankName: dto.bankName ?? null,
      accountName: dto.accountName ?? null,
      accountNumber: dto.accountNumber ?? null,
      contact: dto.contact ?? null,
      notes: dto.notes ?? null,
    });
    return this.vendorRepo.save(v);
  }

  async deleteVendor(billId: string, userId: string, vendorId: string) {
    await this.assertBillCreator(billId, userId);
    const vendor = await this.vendorRepo.findOne({
      where: { id: vendorId, splitBillId: billId },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    await this.vendorRepo.softRemove(vendor);
    return { success: true };
  }

  // ─── Proposals ─────────────────────────────────────────────
  async listProposals(billId: string, viewerId: string) {
    await this.assertViewer(billId, viewerId);
    return this.proposalRepo.find({
      where: { splitBillId: billId },
      relations: ['vendor', 'proposer', 'votes'],
      order: { createdAt: 'DESC' },
    });
  }

  async createProposal(
    billId: string,
    userId: string,
    dto: CreateSplitBillProposalDto,
  ) {
    await this.assertCreatorOrParticipant(billId, userId);
    if (dto.vendorId) {
      const vendor = await this.vendorRepo.findOne({
        where: { id: dto.vendorId, splitBillId: billId },
      });
      if (!vendor) {
        throw new BadRequestException(
          'Vendor does not exist on this bill',
        );
      }
    }
    const totalParticipants = await this.countParticipants(billId);
    const required = Math.max(1, Math.ceil(totalParticipants / 2));
    const p = this.proposalRepo.create({
      splitBillId: billId,
      proposerId: userId,
      title: dto.title.trim(),
      purpose: dto.purpose?.trim() || null,
      vendorId: dto.vendorId ?? null,
      totalAmount: dto.totalAmount,
      status: SplitBillProposalStatus.PENDING,
      requiredApprovals: required,
      votesFor: 0,
      votesAgainst: 0,
    });
    return this.proposalRepo.save(p);
  }

  async castVote(
    billId: string,
    proposalId: string,
    userId: string,
    dto: CastSplitBillProposalVoteDto,
  ) {
    await this.assertCreatorOrParticipant(billId, userId);
    const proposal = await this.proposalRepo.findOne({
      where: { id: proposalId, splitBillId: billId },
    });
    if (!proposal) throw new NotFoundException('Proposal not found');
    if (proposal.status !== SplitBillProposalStatus.PENDING) {
      throw new BadRequestException('Proposal is no longer open for voting');
    }

    // Idempotent: upsert by (proposal_id, voter_id).
    let existing = await this.voteRepo.findOne({
      where: { proposalId, voterId: userId },
    });
    if (existing) {
      if (existing.vote === dto.vote) return proposal;
      existing.vote = dto.vote;
      await this.voteRepo.save(existing);
    } else {
      existing = this.voteRepo.create({
        proposalId,
        voterId: userId,
        vote: dto.vote,
      });
      await this.voteRepo.save(existing);
    }

    // Recompute tallies + decide.
    const tallies = await this.tallies(proposalId);
    proposal.votesFor = tallies.approve;
    proposal.votesAgainst = tallies.reject;

    const totalParticipants = await this.countParticipants(billId);
    if (proposal.votesFor >= proposal.requiredApprovals) {
      proposal.status = SplitBillProposalStatus.APPROVED;
      proposal.decidedAt = new Date();
    } else if (
      proposal.votesAgainst >
      totalParticipants - proposal.requiredApprovals
    ) {
      proposal.status = SplitBillProposalStatus.REJECTED;
      proposal.decidedAt = new Date();
    }
    return this.proposalRepo.save(proposal);
  }

  // ─── Helpers ───────────────────────────────────────────────
  private async tallies(proposalId: string) {
    const rows = await this.voteRepo.find({ where: { proposalId } });
    return {
      approve: rows.filter(
        (r) => r.vote === SplitBillProposalVoteValue.APPROVE,
      ).length,
      reject: rows.filter(
        (r) => r.vote === SplitBillProposalVoteValue.REJECT,
      ).length,
    };
  }

  private async countParticipants(billId: string): Promise<number> {
    return this.participantRepo.count({
      where: { splitBillId: billId },
    });
  }

  // Viewers = anyone connected to the bill (creator or participant).
  // Used for read endpoints (vendor list, proposal list).
  private async assertViewer(billId: string, userId: string) {
    const bill = await this.billRepo.findOne({ where: { id: billId } });
    if (!bill) throw new NotFoundException('Bill not found');
    if (bill.creatorId === userId) return;
    const part = await this.participantRepo.findOne({
      where: { splitBillId: billId, userId },
    });
    if (!part) {
      throw new ForbiddenException(
        'You do not have access to this bill',
      );
    }
  }

  private async assertCreatorOrParticipant(
    billId: string,
    userId: string,
  ) {
    // Same logic as assertViewer — write endpoints accept anyone on
    // the bill. The split between roles is enforced at higher-level
    // moves (e.g. deleting a vendor is creator-only).
    return this.assertViewer(billId, userId);
  }

  private async assertBillCreator(billId: string, userId: string) {
    const bill = await this.billRepo.findOne({ where: { id: billId } });
    if (!bill) throw new NotFoundException('Bill not found');
    if (bill.creatorId !== userId) {
      throw new ForbiddenException('Bill creator only');
    }
  }
}
