import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  SplitBill,
  SplitBillActivity,
  SplitBillParticipant,
  SplitBillProposal,
  SplitBillProposalVote,
  SplitBillVendor,
} from '../entities';
import { SplitBillBudgetItem } from '../entities/split-bill.entity';
import {
  ActivityActionType,
  SplitBillProposalStatus,
  SplitBillProposalVoteValue,
} from '../enums/split-bill.enum';
import {
  CastSplitBillProposalVoteDto,
  CreateSplitBillProposalDto,
  CreateSplitBillVendorDto,
  UpdateSplitBillBudgetDto,
} from '../dtos/split-bill-governance.dto';
import { NotificationService } from '../../notification/services/notification.service';

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
    @InjectRepository(SplitBillActivity)
    private readonly activityRepo: Repository<SplitBillActivity>,
    private readonly notifications: NotificationService,
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

  // ─── Budget ────────────────────────────────────────────────
  // Creator-only. Replaces the entire budget array. New items (no
  // `id` from the wire) get a fresh UUID; existing items keep theirs
  // so the frontend can reference them stably from disbursement
  // proposals. Passing an empty array clears the budget.
  async setBudget(
    billId: string,
    userId: string,
    dto: UpdateSplitBillBudgetDto,
  ) {
    await this.assertBillCreator(billId, userId);
    const bill = await this.billRepo.findOne({ where: { id: billId } });
    if (!bill) throw new NotFoundException('Bill not found');

    const items: SplitBillBudgetItem[] = (dto.budget ?? []).map((b) => ({
      id: b.id?.trim() ? b.id : randomUUID(),
      item: (b.item ?? '').trim(),
      cost: Number(b.cost ?? 0),
      image: b.image?.trim() ? b.image : null,
      note: b.note?.trim() ? b.note : null,
    }));

    bill.budget = items;
    await this.billRepo.save(bill);
    return { budget: bill.budget };
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
    const saved = await this.proposalRepo.save(p);

    // Activity log + fanout to all participants.
    await this.activityRepo.save({
      splitBillId: billId,
      actorId: userId,
      actionType: ActivityActionType.PROPOSAL_CREATED,
      description: `Proposed "${saved.title}" for disbursement`,
      amount: saved.totalAmount as unknown as number,
    });
    await this.fanoutToParticipants({
      billId,
      excludeUserId: userId,
      title: 'New disbursement proposal',
      message:
        `A new proposal "${saved.title}" needs your vote. ` +
        `${saved.votesFor}/${saved.requiredApprovals} approvals so far.`,
      metadata: { proposalId: saved.id, billId },
    });
    return saved;
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
    const wasPending = proposal.status === SplitBillProposalStatus.PENDING;
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
    const saved = await this.proposalRepo.save(proposal);

    // Activity log for the vote itself.
    await this.activityRepo.save({
      splitBillId: billId,
      actorId: userId,
      actionType: ActivityActionType.PROPOSAL_VOTED,
      description: `Voted ${dto.vote} on "${saved.title}"`,
    });
    // Notify the proposer that their proposal got a vote.
    if (userId !== saved.proposerId) {
      await this.notifications.notify(saved.proposerId, 'billReminders', {
        title: 'New vote on your proposal',
        message: `Someone voted ${dto.vote} on "${saved.title}".`,
        type: 'split_bill',
        metadata: { proposalId: saved.id, billId, kind: 'vote_cast' },
      });
    }
    // If the vote flipped a pending proposal, fan out the result.
    if (
      wasPending &&
      saved.status !== SplitBillProposalStatus.PENDING
    ) {
      const approved = saved.status === SplitBillProposalStatus.APPROVED;
      await this.activityRepo.save({
        splitBillId: billId,
        actionType: approved
          ? ActivityActionType.PROPOSAL_APPROVED
          : ActivityActionType.PROPOSAL_REJECTED,
        description: approved
          ? `Proposal "${saved.title}" was approved`
          : `Proposal "${saved.title}" was rejected`,
        amount: approved ? (saved.totalAmount as unknown as number) : undefined,
      });
      await this.fanoutToParticipants({
        billId,
        title: approved
          ? 'Disbursement approved'
          : 'Disbursement rejected',
        message: approved
          ? `"${saved.title}" cleared the approval threshold and is ready to disburse.`
          : `"${saved.title}" was rejected by the group.`,
        metadata: {
          proposalId: saved.id,
          billId,
          kind: approved ? 'proposal_approved' : 'proposal_rejected',
        },
      });
    }
    return saved;
  }

  // Fan a notification out to every participant on the bill,
  // optionally excluding one user (e.g. the actor who triggered it).
  private async fanoutToParticipants(args: {
    billId: string;
    title: string;
    message: string;
    excludeUserId?: string;
    metadata?: Record<string, unknown>;
  }) {
    const parts = await this.participantRepo.find({
      where: { splitBillId: args.billId },
    });
    const targets = new Set<string>();
    for (const p of parts) {
      if (!p.userId) continue;
      if (args.excludeUserId && p.userId === args.excludeUserId) continue;
      targets.add(p.userId);
    }
    for (const uid of targets) {
      try {
        await this.notifications.notify(uid, 'billReminders', {
          title: args.title,
          message: args.message,
          type: 'split_bill',
          metadata: args.metadata,
        });
      } catch (_err) {
        // Don't let one bad recipient kill the rest of the fanout.
      }
    }
  }

  // Creator-only: mark an APPROVED proposal as EXECUTED. This MVP
  // only flips status + emits an activity entry + fans out a "funds
  // disbursed" notification — actual money movement is handled
  // externally by the creator. Once bill-level escrow consolidation
  // exists we can wire the cross-wallet release here.
  async executeProposal(
    billId: string,
    userId: string,
    proposalId: string,
  ) {
    await this.assertBillCreator(billId, userId);
    const proposal = await this.proposalRepo.findOne({
      where: { id: proposalId, splitBillId: billId },
      relations: ['vendor'],
    });
    if (!proposal) throw new NotFoundException('Proposal not found');
    if (proposal.status !== SplitBillProposalStatus.APPROVED) {
      throw new BadRequestException(
        'Only approved proposals can be executed',
      );
    }
    proposal.status = SplitBillProposalStatus.EXECUTED;
    proposal.decidedAt = new Date();
    const saved = await this.proposalRepo.save(proposal);

    await this.activityRepo.save({
      splitBillId: billId,
      actorId: userId,
      actionType: ActivityActionType.PROPOSAL_EXECUTED,
      description: `Marked "${saved.title}" as disbursed`,
      amount: saved.totalAmount as unknown as number,
    });

    await this.fanoutToParticipants({
      billId,
      title: 'Funds disbursed',
      message:
        `"${saved.title}" has been marked as disbursed by the bill creator.`,
      metadata: {
        proposalId: saved.id,
        billId,
        kind: 'proposal_executed',
      },
    });

    return saved;
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
