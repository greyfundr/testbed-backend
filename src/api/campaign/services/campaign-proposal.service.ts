import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In, LessThan } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  Campaign,
  CampaignProposal,
  CampaignProposalAllocation,
  CampaignProposalVote,
  CampaignProposalAssignment,
  CampaignVendor,
  CampaignOrganizer,
  CampaignUpdate,
  Donation,
} from '../entities';
import { ProposalAssignmentDecision } from '../entities/campaign-proposal-assignment.entity';
import { User } from '../../user/entities';
import { NotificationService } from '../../notification/services/notification.service';
import {
  CreateProposalDto,
  VoteProposalDto,
} from '../dto/campaign-proposal.dto';
import {
  ProposalStatus,
  ProposalVoteValue,
} from '../enums/campaign.enum';

// Random-donor approval flow. Each proposal is routed sequentially to up to
// three top donors (excluding the creator and any organiser row). Each
// assignee has 2 minutes to approve or reject; if they time out we move on
// to the next pick. First to 2 matching decisions settles the proposal. If
// the picked pool is exhausted without consensus we settle as REJECTED
// with reason `no_quorum`.
const ASSIGNMENT_TTL_MS = 2 * 60 * 1000;
const DONOR_POOL_MAX = 20;
const ASSIGNEES_PER_PROPOSAL = 3;
const REQUIRED_APPROVALS = 2;

type ProposalBroadcastType =
  | 'proposal_created'
  | 'proposal_voted'
  | 'proposal_cancelled'
  | 'proposal_executed'
  | 'proposal_reassigned'
  | 'proposal_expired';

@Injectable()
export class CampaignProposalService {
  private readonly logger = new Logger(CampaignProposalService.name);

  constructor(
    @InjectRepository(CampaignProposal)
    private readonly proposalRepo: Repository<CampaignProposal>,
    @InjectRepository(CampaignProposalAllocation)
    private readonly allocRepo: Repository<CampaignProposalAllocation>,
    @InjectRepository(CampaignProposalVote)
    private readonly voteRepo: Repository<CampaignProposalVote>,
    @InjectRepository(CampaignProposalAssignment)
    private readonly assignmentRepo: Repository<CampaignProposalAssignment>,
    @InjectRepository(Campaign)
    private readonly campaignRepo: Repository<Campaign>,
    @InjectRepository(CampaignVendor)
    private readonly vendorRepo: Repository<CampaignVendor>,
    @InjectRepository(CampaignOrganizer)
    private readonly organizerRepo: Repository<CampaignOrganizer>,
    @InjectRepository(CampaignUpdate)
    private readonly updateRepo: Repository<CampaignUpdate>,
    @InjectRepository(Donation)
    private readonly donationRepo: Repository<Donation>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
    private readonly notificationService: NotificationService,
  ) {}

  private broadcast(
    campaignId: string,
    type: ProposalBroadcastType,
    data: unknown,
  ) {
    this.eventEmitter.emit('campaign.proposal_changed', {
      campaignId,
      type,
      data,
    });
  }

  /* ---------- helpers ---------- */

  // Set of user ids who are allowed to *propose* on this campaign — the
  // creator plus any organiser with a linked user account. (Note: this is
  // the propose-side gate. Voting is independent and routed to randomly
  // picked top donors via assignments — see pickDonorPool below.)
  private async getProposerIds(campaign: Campaign): Promise<string[]> {
    const orgs = await this.organizerRepo.find({
      where: { campaignId: campaign.id },
    });
    const ids = new Set<string>([campaign.creatorId]);
    for (const o of orgs) {
      if (o.userId) ids.add(o.userId);
    }
    return Array.from(ids);
  }

  // Excluded set for the donor-vote pool: the campaign creator plus every
  // organiser row (any status, including pending/rejected — they're still
  // "tied to decisions" per the entity comment).
  private async getExcludedUserIds(campaign: Campaign): Promise<Set<string>> {
    const orgs = await this.organizerRepo.find({
      where: { campaignId: campaign.id },
    });
    const excluded = new Set<string>([campaign.creatorId]);
    for (const o of orgs) {
      if (o.userId) excluded.add(o.userId);
    }
    return excluded;
  }

  // Picks up to `ASSIGNEES_PER_PROPOSAL` random donor user ids from the
  // top `DONOR_POOL_MAX` non-anonymous donors on the campaign, excluding
  // the creator and any organiser row. Donors are sampled uniformly so
  // top spenders don't always get the assignment.
  private async pickDonorPool(campaign: Campaign): Promise<string[]> {
    const excluded = await this.getExcludedUserIds(campaign);

    // Top N non-anonymous donors by lifetime donation sum on this campaign.
    // Mirrors the donation-leaderboard query pattern used elsewhere.
    const rows = await this.donationRepo
      .createQueryBuilder('d')
      .select('d.donor_id', 'donorId')
      .addSelect('SUM(d.amount)', 'total')
      .where('d.campaign_id = :id', { id: campaign.id })
      .andWhere('d.is_anonymous = 0')
      .andWhere('d.donor_id IS NOT NULL')
      .groupBy('d.donor_id')
      .orderBy('total', 'DESC')
      .limit(DONOR_POOL_MAX)
      .getRawMany<{ donorId: string; total: string }>();

    const candidates = rows
      .map((r) => r.donorId)
      .filter((id) => id && !excluded.has(id));

    // Fisher-Yates shuffle, then take up to N.
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    return candidates.slice(0, ASSIGNEES_PER_PROPOSAL);
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

    const proposers = await this.getProposerIds(campaign);
    if (!proposers.includes(userId)) {
      throw new ForbiddenException(
        'Only the campaign creator or organisers can propose disbursements',
      );
    }

    // Vendor (optional) must be scoped to this campaign.
    if (dto.vendorId) {
      const vendor = await this.vendorRepo.findOne({
        where: { id: dto.vendorId, campaignId },
      });
      if (!vendor) {
        throw new BadRequestException('Vendor not found for this campaign');
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
        throw new BadRequestException(`Unknown budget item: ${a.budgetRef}`);
      }
    }

    const pickedDonorIds = await this.pickDonorPool(campaign);
    if (pickedDonorIds.length === 0) {
      throw new BadRequestException(
        "No eligible donors yet — wait for non-anonymous donations from outside your organiser team before proposing a disbursement.",
      );
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + ASSIGNMENT_TTL_MS);

    const { proposal, assignment } = await this.dataSource.transaction(
      async (mgr) => {
        const proposalRow = mgr.create(CampaignProposal, {
          campaignId,
          proposerId: userId,
          title: dto.title,
          purpose: dto.purpose ?? null,
          vendorId: dto.vendorId ?? null,
          totalAmount: total,
          status: ProposalStatus.PENDING,
          requiredApprovals: REQUIRED_APPROVALS,
          votesFor: 0,
          votesAgainst: 0,
          pickedDonorIds,
        });
        const savedProposal = await mgr.save(proposalRow);

        const allocs = dto.allocations.map((a) =>
          mgr.create(CampaignProposalAllocation, {
            proposalId: savedProposal.id,
            budgetRef: a.budgetRef ?? null,
            label: a.label,
            amount: a.amount,
          }),
        );
        await mgr.save(allocs);
        savedProposal.allocations = allocs;

        const firstAssignment = mgr.create(CampaignProposalAssignment, {
          proposalId: savedProposal.id,
          donorUserId: pickedDonorIds[0],
          sortIndex: 0,
          decision: ProposalAssignmentDecision.PENDING,
          assignedAt: now,
          expiresAt,
        });
        const savedAssignment = await mgr.save(firstAssignment);

        savedProposal.currentAssignmentId = savedAssignment.id;
        savedProposal.assignmentExpiresAt = expiresAt;
        await mgr.save(savedProposal);

        return { proposal: savedProposal, assignment: savedAssignment };
      },
    );

    this.broadcast(campaignId, 'proposal_created', {
      proposalId: proposal.id,
      assigneeId: assignment.donorUserId,
      assignmentExpiresAt: expiresAt.toISOString(),
    });

    try {
      await this.notifyAssignee(campaign, proposal, assignment);
    } catch (err) {
      this.logger.error(
        `notifyAssignee failed for proposal ${proposal.id}: ${(err as Error).message}`,
      );
    }

    return proposal;
  }

  async vote(proposalId: string, userId: string, dto: VoteProposalDto) {
    const proposal = await this.proposalRepo.findOne({
      where: { id: proposalId },
      relations: ['campaign'],
    });
    if (!proposal) throw new NotFoundException('Proposal not found');
    if (proposal.status !== ProposalStatus.PENDING) {
      throw new ConflictException('Proposal is no longer accepting votes');
    }
    if (!proposal.currentAssignmentId) {
      throw new ConflictException(
        'Proposal has no active assignee — it may have timed out',
      );
    }

    const assignment = await this.assignmentRepo.findOne({
      where: { id: proposal.currentAssignmentId },
    });
    if (!assignment) {
      throw new ConflictException('Current assignment vanished');
    }
    if (assignment.donorUserId !== userId) {
      throw new ForbiddenException(
        'This disbursement is currently routed to someone else',
      );
    }
    if (assignment.decision !== ProposalAssignmentDecision.PENDING) {
      throw new ConflictException('You have already responded');
    }
    if (assignment.expiresAt.getTime() < Date.now()) {
      throw new ConflictException(
        "Your 2-minute window has expired — it's already been reassigned",
      );
    }

    const isApprove = dto.vote === ProposalVoteValue.APPROVE;
    const result = await this.dataSource.transaction(async (mgr) => {
      assignment.decision = isApprove
        ? ProposalAssignmentDecision.APPROVE
        : ProposalAssignmentDecision.REJECT;
      assignment.decidedAt = new Date();
      await mgr.save(assignment);

      if (isApprove) {
        proposal.votesFor += 1;
      } else {
        proposal.votesAgainst += 1;
      }

      if (proposal.votesFor >= REQUIRED_APPROVALS) {
        return this.applySettlement(
          mgr,
          proposal,
          ProposalStatus.APPROVED,
          null,
        );
      }
      if (proposal.votesAgainst >= REQUIRED_APPROVALS) {
        return this.applySettlement(
          mgr,
          proposal,
          ProposalStatus.REJECTED,
          null,
        );
      }

      // No consensus yet — clear current assignment and let the caller
      // advance to the next pick outside of the transaction so the
      // assignee notification doesn't run inside the DB lock.
      proposal.currentAssignmentId = null;
      proposal.assignmentExpiresAt = null;
      await mgr.save(proposal);
      return proposal;
    });

    this.broadcast(proposal.campaignId, 'proposal_voted', {
      proposalId,
      status: result.status,
      assignmentDecision: assignment.decision,
    });

    if (result.status === ProposalStatus.PENDING) {
      try {
        await this.advance(result, assignment.sortIndex + 1);
      } catch (err) {
        this.logger.error(
          `advance failed for proposal ${result.id}: ${(err as Error).message}`,
        );
      }
    } else {
      try {
        await this.handleSettlement(proposal.campaign, result);
      } catch (err) {
        this.logger.error(
          `handleSettlement failed for proposal ${result.id}: ${(err as Error).message}`,
        );
      }
    }
    return result;
  }

  // Routes the proposal to the next picked donor, or settles it as
  // REJECTED with reason `no_quorum` if the pool is exhausted. Always
  // refreshes assignmentExpiresAt and broadcasts so any open client UI
  // updates without polling.
  private async advance(
    proposal: CampaignProposal,
    nextSortIndex: number,
  ): Promise<void> {
    const pool = proposal.pickedDonorIds ?? [];
    if (nextSortIndex >= pool.length) {
      const settled = await this.dataSource.transaction(async (mgr) =>
        this.applySettlement(
          mgr,
          proposal,
          ProposalStatus.REJECTED,
          'no_quorum',
        ),
      );
      this.broadcast(proposal.campaignId, 'proposal_voted', {
        proposalId: proposal.id,
        status: settled.status,
        reason: settled.rejectionReason,
      });
      await this.handleSettlement(undefined, settled);
      return;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + ASSIGNMENT_TTL_MS);
    const assignment = await this.dataSource.transaction(async (mgr) => {
      const created = mgr.create(CampaignProposalAssignment, {
        proposalId: proposal.id,
        donorUserId: pool[nextSortIndex],
        sortIndex: nextSortIndex,
        decision: ProposalAssignmentDecision.PENDING,
        assignedAt: now,
        expiresAt,
      });
      const saved = await mgr.save(created);
      proposal.currentAssignmentId = saved.id;
      proposal.assignmentExpiresAt = expiresAt;
      await mgr.save(proposal);
      return saved;
    });

    this.broadcast(proposal.campaignId, 'proposal_reassigned', {
      proposalId: proposal.id,
      assigneeId: assignment.donorUserId,
      assignmentExpiresAt: expiresAt.toISOString(),
      sortIndex: assignment.sortIndex,
    });

    // Need a fresh campaign object for the notification template.
    const campaign = await this.campaignRepo.findOne({
      where: { id: proposal.campaignId },
    });
    if (campaign) {
      try {
        await this.notifyAssignee(campaign, proposal, assignment);
      } catch (err) {
        this.logger.error(
          `notifyAssignee (advance) failed: ${(err as Error).message}`,
        );
      }
    }
  }

  // Sets terminal state on a proposal in-transaction. Clears
  // currentAssignmentId/assignmentExpiresAt so the frontend stops
  // showing a countdown. Caller is responsible for the post-commit
  // side effects (activity-log update, proposer notification).
  private async applySettlement(
    mgr: import('typeorm').EntityManager,
    proposal: CampaignProposal,
    status: ProposalStatus,
    rejectionReason: string | null,
  ): Promise<CampaignProposal> {
    proposal.status = status;
    proposal.decidedAt = new Date();
    proposal.currentAssignmentId = null;
    proposal.assignmentExpiresAt = null;
    proposal.rejectionReason = rejectionReason;
    return mgr.save(proposal);
  }

  // After-commit side effects: post a system activity-log update and,
  // when approved, tell the proposer they can execute the withdrawal.
  private async handleSettlement(
    campaign: Campaign | undefined,
    proposal: CampaignProposal,
  ): Promise<void> {
    const campaignRow =
      campaign ??
      (await this.campaignRepo.findOne({
        where: { id: proposal.campaignId },
      }));
    if (!campaignRow) return;

    await this.postActivityLog(campaignRow, proposal);

    if (proposal.status === ProposalStatus.APPROVED) {
      await this.notifyProposerApproved(campaignRow, proposal);
    } else if (proposal.status === ProposalStatus.REJECTED) {
      await this.notifyProposerRejected(campaignRow, proposal);
    }
  }

  // Posts a system-generated CampaignUpdate so the settlement shows in
  // the campaign's activity feed. Authored by the proposer because the
  // schema requires a real user; the body is the system narrative.
  private async postActivityLog(
    campaign: Campaign,
    proposal: CampaignProposal,
  ): Promise<void> {
    const money = this.formatNaira(Number(proposal.totalAmount));
    let body: string;
    if (proposal.status === ProposalStatus.APPROVED) {
      body = `✅ Disbursement proposal "${proposal.title}" (${money}) was approved by donor vote.`;
    } else if (
      proposal.status === ProposalStatus.REJECTED &&
      proposal.rejectionReason === 'no_quorum'
    ) {
      body = `⛔ Disbursement proposal "${proposal.title}" (${money}) lapsed without consensus — no donor approved in time.`;
    } else if (proposal.status === ProposalStatus.REJECTED) {
      body = `⛔ Disbursement proposal "${proposal.title}" (${money}) was rejected by donor vote.`;
    } else {
      return;
    }

    try {
      await this.updateRepo.save(
        this.updateRepo.create({
          campaignId: campaign.id,
          authorId: proposal.proposerId,
          body,
          pinned: false,
        }),
      );
    } catch (err) {
      this.logger.error(
        `postActivityLog failed for proposal ${proposal.id}: ${(err as Error).message}`,
      );
    }
  }

  /* ---------- notification dispatch ---------- */

  // Sends the current assignee a vote-request notification with the
  // 2-minute deadline so the client can render a countdown.
  private async notifyAssignee(
    campaign: Campaign,
    proposal: CampaignProposal,
    assignment: CampaignProposalAssignment,
  ): Promise<void> {
    const donor = await this.userRepo.findOne({
      where: { id: assignment.donorUserId },
    });
    if (!donor) return;
    const money = this.formatNaira(Number(proposal.totalAmount));
    const campaignTitle = campaign.title ?? 'this campaign';
    const html = this.buildAssigneeEmailHtml(
      donor.firstName,
      campaignTitle,
      proposal.title,
      money,
    );
    await this.notificationService.notify(donor.id, 'campaignUpdates', {
      title: 'Disbursement approval needed',
      message: `You've been randomly picked to vote on "${proposal.title}" (${money}) on "${campaignTitle}". You have 2 minutes to approve or reject.`,
      type: 'campaign',
      metadata: {
        kind: 'disbursement_vote_request',
        campaignId: campaign.id,
        campaignTitle,
        proposalId: proposal.id,
        proposalTitle: proposal.title,
        assignmentId: assignment.id,
        assignmentExpiresAt: assignment.expiresAt.toISOString(),
        pushToken: donor.fcmToken,
        phoneNumber: donor.phoneNumber,
        email: donor.email,
        emailHtml: html,
      },
    });
  }

  private async notifyProposerApproved(
    campaign: Campaign,
    proposal: CampaignProposal,
  ): Promise<void> {
    const proposer = await this.userRepo.findOne({
      where: { id: proposal.proposerId },
    });
    if (!proposer) return;
    const money = this.formatNaira(Number(proposal.totalAmount));
    const campaignTitle = campaign.title ?? 'this campaign';
    const html = this.buildApprovedEmailHtml(
      proposer.firstName,
      campaignTitle,
      proposal.title,
      money,
    );
    await this.notificationService.notify(proposer.id, 'campaignUpdates', {
      title: 'Disbursement approved',
      message: `Your proposal "${proposal.title}" (${money}) on "${campaignTitle}" has been approved. You can now execute the withdrawal.`,
      type: 'campaign',
      metadata: {
        kind: 'disbursement_approved',
        campaignId: campaign.id,
        campaignTitle,
        proposalId: proposal.id,
        proposalTitle: proposal.title,
        pushToken: proposer.fcmToken,
        phoneNumber: proposer.phoneNumber,
        email: proposer.email,
        emailHtml: html,
      },
    });
  }

  private async notifyProposerRejected(
    campaign: Campaign,
    proposal: CampaignProposal,
  ): Promise<void> {
    const proposer = await this.userRepo.findOne({
      where: { id: proposal.proposerId },
    });
    if (!proposer) return;
    const money = this.formatNaira(Number(proposal.totalAmount));
    const campaignTitle = campaign.title ?? 'this campaign';
    const reason = proposal.rejectionReason === 'no_quorum'
      ? 'No donor approved in time.'
      : 'Donors rejected the proposal.';
    await this.notificationService.notify(proposer.id, 'campaignUpdates', {
      title: 'Disbursement not approved',
      message: `Your proposal "${proposal.title}" (${money}) on "${campaignTitle}" was not approved. ${reason}`,
      type: 'campaign',
      metadata: {
        kind: 'disbursement_rejected',
        campaignId: campaign.id,
        campaignTitle,
        proposalId: proposal.id,
        proposalTitle: proposal.title,
        rejectionReason: proposal.rejectionReason,
        pushToken: proposer.fcmToken,
        phoneNumber: proposer.phoneNumber,
        email: proposer.email,
      },
    });
  }

  /* ---------- cron: timeout sweeper ---------- */

  // Every 30 seconds, find assignments whose 2-minute window has lapsed,
  // mark them TIMEOUT, and advance the proposal to the next pick. Runs
  // in process; relies on `idx_cpa_pending_expiry` for fast lookup.
  @Cron(CronExpression.EVERY_30_SECONDS)
  async expireStaleAssignments(): Promise<void> {
    const now = new Date();
    const stale = await this.assignmentRepo.find({
      where: {
        decision: ProposalAssignmentDecision.PENDING,
        expiresAt: LessThan(now),
      },
      take: 50,
    });
    if (stale.length === 0) return;

    for (const a of stale) {
      try {
        await this.dataSource.transaction(async (mgr) => {
          // Re-read inside the transaction to avoid double-handling
          // races with a manual vote that just landed.
          const fresh = await mgr.findOne(CampaignProposalAssignment, {
            where: { id: a.id },
          });
          if (!fresh) return;
          if (fresh.decision !== ProposalAssignmentDecision.PENDING) return;
          fresh.decision = ProposalAssignmentDecision.TIMEOUT;
          fresh.decidedAt = now;
          await mgr.save(fresh);
        });

        const proposal = await this.proposalRepo.findOne({
          where: { id: a.proposalId },
        });
        if (!proposal) continue;
        if (proposal.status !== ProposalStatus.PENDING) continue;

        this.broadcast(proposal.campaignId, 'proposal_expired', {
          proposalId: proposal.id,
          assignmentId: a.id,
          sortIndex: a.sortIndex,
        });

        await this.advance(proposal, a.sortIndex + 1);
      } catch (err) {
        this.logger.error(
          `expireStaleAssignments failed for assignment ${a.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  /* ---------- other mutations (unchanged behaviour) ---------- */

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
      throw new ConflictException('Only pending proposals can be cancelled');
    }
    p.status = ProposalStatus.CANCELLED;
    p.decidedAt = new Date();
    p.currentAssignmentId = null;
    p.assignmentExpiresAt = null;
    const saved = await this.proposalRepo.save(p);
    this.broadcast(p.campaignId, 'proposal_cancelled', {
      proposalId: p.id,
    });
    return saved;
  }

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

  // Backwards-compatible list endpoint. The old `myVote` field is kept
  // for any legacy clients; new clients should look at `myAssignment`
  // to know if they're the current assignee. Vote totals are stripped
  // for non-assignee viewers so the creator/organisers can't see who
  // voted what.
  async listWithMyVote(campaignId: string, userId: string | null) {
    const proposals = await this.list(campaignId);
    if (proposals.length === 0) return [];

    let myAssignmentByProposal = new Map<
      string,
      { id: string; expiresAt: Date }
    >();
    let myVoteByProposal = new Map<string, string>();

    if (userId) {
      const assignments = await this.assignmentRepo.find({
        where: {
          donorUserId: userId,
          proposalId: In(proposals.map((p) => p.id)),
          decision: ProposalAssignmentDecision.PENDING,
        },
      });
      myAssignmentByProposal = new Map(
        assignments
          .filter((a) => a.expiresAt.getTime() > Date.now())
          .map((a) => [a.proposalId, { id: a.id, expiresAt: a.expiresAt }]),
      );

      const legacyVotes = await this.voteRepo.find({
        where: {
          voterId: userId,
          proposalId: In(proposals.map((p) => p.id)),
        },
      });
      myVoteByProposal = new Map(legacyVotes.map((v) => [v.proposalId, v.vote]));
    }

    return proposals.map((p) => {
      const myAssignment = myAssignmentByProposal.get(p.id) ?? null;
      const isAssignee = myAssignment !== null;
      return {
        ...p,
        // myVote is preserved for the legacy clients; in the new flow
        // we don't write to the votes table, so it's null for fresh
        // proposals.
        myVote: myVoteByProposal.get(p.id) ?? null,
        myAssignment: myAssignment
          ? {
              id: myAssignment.id,
              expiresAt: myAssignment.expiresAt.toISOString(),
            }
          : null,
        // Vote counters are surfaced only to the active assignee so
        // creator/organisers can't see who's voting what.
        votesFor: isAssignee ? p.votesFor : 0,
        votesAgainst: isAssignee ? p.votesAgainst : 0,
      };
    });
  }

  /* ---------- email body helpers ---------- */

  private formatNaira(amount: number): string {
    if (!Number.isFinite(amount)) return '₦0';
    return `₦${amount.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
  }

  private escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) =>
      c === '&'
        ? '&amp;'
        : c === '<'
          ? '&lt;'
          : c === '>'
            ? '&gt;'
            : c === '"'
              ? '&quot;'
              : '&#39;',
    );
  }

  private buildAssigneeEmailHtml(
    recipientFirstName: string | null,
    campaignTitle: string,
    proposalTitle: string,
    money: string,
  ): string {
    const greeting = recipientFirstName?.trim()
      ? this.escapeHtml(recipientFirstName.trim())
      : 'there';
    return `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;line-height:1.55;font-size:15px;">
        <p>Hi ${greeting},</p>
        <p>You've been randomly selected to vote on a disbursement proposal on <strong>"${this.escapeHtml(campaignTitle)}"</strong>:</p>
        <p style="margin:8px 0 16px 0;padding:12px 14px;background:#F4F4F7;border-radius:8px;">
          <strong>${this.escapeHtml(proposalTitle)}</strong><br/>
          <span style="color:#6b6b73;font-size:13px;">Total: ${this.escapeHtml(money)}</span>
        </p>
        <p><strong>You have 2 minutes to approve or reject.</strong> Open the GreyFundr app and head to your notifications to vote.</p>
        <p style="color:#6b6b73;font-size:13px;">If you don't respond in time, the proposal is automatically reassigned to another donor.</p>
      </div>
    `;
  }

  private buildApprovedEmailHtml(
    recipientFirstName: string | null,
    campaignTitle: string,
    proposalTitle: string,
    money: string,
  ): string {
    const greeting = recipientFirstName?.trim()
      ? this.escapeHtml(recipientFirstName.trim())
      : 'there';
    return `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;line-height:1.55;font-size:15px;">
        <p>Hi ${greeting},</p>
        <p>Great news — your disbursement proposal on <strong>"${this.escapeHtml(campaignTitle)}"</strong> just cleared the donor vote:</p>
        <p style="margin:8px 0 16px 0;padding:12px 14px;background:#E8F5EE;border-left:3px solid #0B7A4B;border-radius:6px;">
          <strong>${this.escapeHtml(proposalTitle)}</strong><br/>
          <span style="color:#0B7A4B;font-size:13px;">Approved · ${this.escapeHtml(money)}</span>
        </p>
        <p>Open the GreyFundr app and head to the campaign's <strong>Governance</strong> tab to execute the withdrawal.</p>
      </div>
    `;
  }
}
