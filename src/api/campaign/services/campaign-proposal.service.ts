import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Campaign,
  CampaignProposal,
  CampaignProposalAllocation,
  CampaignProposalVote,
  CampaignVendor,
  CampaignOrganizer,
} from '../entities';
import {
  CreateProposalDto,
  VoteProposalDto,
} from '../dto/campaign-proposal.dto';
import {
  ApprovalThresholdMode,
  ProposalStatus,
  ProposalVoteValue,
} from '../enums/campaign.enum';

@Injectable()
export class CampaignProposalService {
  constructor(
    @InjectRepository(CampaignProposal)
    private readonly proposalRepo: Repository<CampaignProposal>,
    @InjectRepository(CampaignProposalAllocation)
    private readonly allocRepo: Repository<CampaignProposalAllocation>,
    @InjectRepository(CampaignProposalVote)
    private readonly voteRepo: Repository<CampaignProposalVote>,
    @InjectRepository(Campaign)
    private readonly campaignRepo: Repository<Campaign>,
    @InjectRepository(CampaignVendor)
    private readonly vendorRepo: Repository<CampaignVendor>,
    @InjectRepository(CampaignOrganizer)
    private readonly organizerRepo: Repository<CampaignOrganizer>,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private broadcast(
    campaignId: string,
    type:
      | 'proposal_created'
      | 'proposal_voted'
      | 'proposal_cancelled'
      | 'proposal_executed',
    data: unknown,
  ) {
    this.eventEmitter.emit('campaign.proposal_changed', {
      campaignId,
      type,
      data,
    });
  }

  /* ---------- helpers ---------- */

  // List of user ids allowed to vote on proposals for this campaign:
  // the creator + any organizer with a linked user account.
  private async getApproverIds(campaign: Campaign): Promise<string[]> {
    const orgs = await this.organizerRepo.find({
      where: { campaignId: campaign.id },
    });
    const ids = new Set<string>([campaign.creatorId]);
    for (const o of orgs) {
      if (o.userId) ids.add(o.userId);
    }
    return Array.from(ids);
  }

  // ceil(approvers * 0.33), min 2, but never more than the approver count.
  private autoThreshold(approverCount: number): number {
    if (approverCount <= 0) return 1;
    const computed = Math.max(2, Math.ceil(approverCount * 0.33));
    return Math.min(computed, approverCount);
  }

  private resolveRequiredApprovals(
    campaign: Campaign,
    approverCount: number,
  ): number {
    if (
      campaign.approvalThresholdMode === ApprovalThresholdMode.MANUAL &&
      campaign.approvalThresholdCount &&
      campaign.approvalThresholdCount > 0
    ) {
      return Math.min(campaign.approvalThresholdCount, approverCount || 1);
    }
    return this.autoThreshold(approverCount);
  }

  /* ---------- queries ---------- */

  async list(campaignId: string) {
    return this.proposalRepo.find({
      where: { campaignId },
      relations: ['allocations', 'vendor', 'proposer'],
      order: { createdAt: 'DESC' },
    });
  }

  async get(proposalId: string) {
    const p = await this.proposalRepo.findOne({
      where: { id: proposalId },
      relations: ['allocations', 'vendor', 'proposer', 'votes'],
    });
    if (!p) throw new NotFoundException('Proposal not found');
    return p;
  }

  /* ---------- mutations ---------- */

  async create(campaignId: string, userId: string, dto: CreateProposalDto) {
    const campaign = await this.campaignRepo.findOne({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');

    const approvers = await this.getApproverIds(campaign);
    if (!approvers.includes(userId)) {
      throw new ForbiddenException(
        'Only the campaign creator or organizers can propose disbursements',
      );
    }

    // Vendor (optional) must be scoped to this campaign.
    if (dto.vendorId) {
      const vendor = await this.vendorRepo.findOne({
        where: { id: dto.vendorId, campaignId },
      });
      if (!vendor) {
        throw new BadRequestException(
          'Vendor not found for this campaign',
        );
      }
    }

    if (!dto.allocations.length) {
      throw new BadRequestException('At least one allocation required');
    }
    const total = dto.allocations.reduce(
      (s, a) => s + Number(a.amount || 0),
      0,
    );
    if (total <= 0) {
      throw new BadRequestException('Total allocation must be positive');
    }

    // Budget refs must match items declared on the campaign.
    const budget = campaign.budget ?? [];
    const knownIds = new Set(budget.map((b) => b.id).filter(Boolean));
    for (const a of dto.allocations) {
      if (a.budgetRef && !knownIds.has(a.budgetRef)) {
        throw new BadRequestException(
          `Unknown budget item: ${a.budgetRef}`,
        );
      }
    }

    const requiredApprovals = this.resolveRequiredApprovals(
      campaign,
      approvers.length,
    );

    const result = await this.dataSource.transaction(async (mgr) => {
      const proposal = mgr.create(CampaignProposal, {
        campaignId,
        proposerId: userId,
        title: dto.title,
        purpose: dto.purpose ?? null,
        vendorId: dto.vendorId ?? null,
        totalAmount: total,
        status: ProposalStatus.PENDING,
        requiredApprovals,
        votesFor: 0,
        votesAgainst: 0,
      });
      const saved = await mgr.save(proposal);

      const allocs = dto.allocations.map((a) =>
        mgr.create(CampaignProposalAllocation, {
          proposalId: saved.id,
          budgetRef: a.budgetRef ?? null,
          label: a.label,
          amount: a.amount,
        }),
      );
      await mgr.save(allocs);
      saved.allocations = allocs;
      return saved;
    });
    this.broadcast(campaignId, 'proposal_created', { proposalId: result.id });
    return result;
  }

  async vote(proposalId: string, userId: string, dto: VoteProposalDto) {
    const proposal = await this.proposalRepo.findOne({
      where: { id: proposalId },
      relations: ['campaign'],
    });
    if (!proposal) throw new NotFoundException('Proposal not found');
    if (proposal.status !== ProposalStatus.PENDING) {
      throw new ConflictException(
        'Proposal is no longer accepting votes',
      );
    }

    const approvers = await this.getApproverIds(proposal.campaign);
    if (!approvers.includes(userId)) {
      throw new ForbiddenException(
        'Only campaign approvers can vote on proposals',
      );
    }

    const existing = await this.voteRepo.findOne({
      where: { proposalId, voterId: userId },
    });
    if (existing) {
      throw new ConflictException('You have already voted on this proposal');
    }

    const result = await this.dataSource.transaction(async (mgr) => {
      await mgr.save(
        mgr.create(CampaignProposalVote, {
          proposalId,
          voterId: userId,
          vote: dto.vote,
        }),
      );
      if (dto.vote === ProposalVoteValue.APPROVE) {
        proposal.votesFor += 1;
      } else {
        proposal.votesAgainst += 1;
      }

      const required = proposal.requiredApprovals;
      const rejectCutoff = Math.max(
        1,
        approvers.length - required + 1,
      );

      if (proposal.votesFor >= required) {
        proposal.status = ProposalStatus.APPROVED;
        proposal.decidedAt = new Date();
      } else if (proposal.votesAgainst >= rejectCutoff) {
        proposal.status = ProposalStatus.REJECTED;
        proposal.decidedAt = new Date();
      }

      return mgr.save(proposal);
    });
    this.broadcast(proposal.campaignId, 'proposal_voted', {
      proposalId,
      status: result.status,
    });
    return result;
  }

  async cancel(proposalId: string, userId: string) {
    const p = await this.proposalRepo.findOne({
      where: { id: proposalId },
      relations: ['campaign'],
    });
    if (!p) throw new NotFoundException('Proposal not found');
    const isProposer = p.proposerId === userId;
    const isCreator = p.campaign.creatorId === userId;
    if (!isProposer && !isCreator) {
      throw new ForbiddenException(
        'Only the proposer or campaign creator can cancel',
      );
    }
    if (p.status !== ProposalStatus.PENDING) {
      throw new ConflictException(
        'Only pending proposals can be cancelled',
      );
    }
    p.status = ProposalStatus.CANCELLED;
    p.decidedAt = new Date();
    const saved = await this.proposalRepo.save(p);
    this.broadcast(p.campaignId, 'proposal_cancelled', {
      proposalId: p.id,
    });
    return saved;
  }

  // Mark APPROVED proposal as EXECUTED once disbursement has settled.
  // For now this is creator-only and trusts an external payout flow; it
  // exists so the UI can flip a chip from "Approved" to "Executed".
  async markExecuted(proposalId: string, userId: string) {
    const p = await this.proposalRepo.findOne({
      where: { id: proposalId },
      relations: ['campaign'],
    });
    if (!p) throw new NotFoundException('Proposal not found');
    if (p.campaign.creatorId !== userId) {
      throw new ForbiddenException(
        'Only the campaign creator can mark a proposal executed',
      );
    }
    if (p.status !== ProposalStatus.APPROVED) {
      throw new ConflictException(
        'Only approved proposals can be marked executed',
      );
    }
    p.status = ProposalStatus.EXECUTED;
    p.decidedAt = new Date();
    const saved = await this.proposalRepo.save(p);
    this.broadcast(p.campaignId, 'proposal_executed', {
      proposalId: p.id,
    });
    return saved;
  }

  // Convenience: load proposals + my-vote per proposal in one shot.
  async listWithMyVote(campaignId: string, userId: string | null) {
    const proposals = await this.list(campaignId);
    if (!userId || proposals.length === 0) {
      return proposals.map((p) => ({ ...p, myVote: null }));
    }
    const votes = await this.voteRepo.find({
      where: {
        voterId: userId,
        proposalId: In(proposals.map((p) => p.id)),
      },
    });
    const byProposal = new Map(votes.map((v) => [v.proposalId, v.vote]));
    return proposals.map((p) => ({
      ...p,
      myVote: byProposal.get(p.id) ?? null,
    }));
  }
}
