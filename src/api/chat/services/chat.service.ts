import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Brackets } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ChatMessage } from '../entities/chat-message.entity';
import { User } from '../../user/entities';
import { Block, Follow } from '../../user/entities';

// One-on-one chat MVP. No threads table — a "conversation" is just
// the union of messages where the (sender, recipient) pair matches
// in either direction. We rely on two compound indexes to make the
// ORed query cheap (see migration).
@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatMessage)
    private readonly messageRepo: Repository<ChatMessage>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Block)
    private readonly blockRepo: Repository<Block>,
    @InjectRepository(Follow)
    private readonly followRepo: Repository<Follow>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // Mutual-follow gate: chat is restricted to "friends" — pairs of
  // users that follow each other in BOTH directions. Returns true
  // when the two follow-rows exist.
  private async _isMutualFollow(
    userAId: string,
    userBId: string,
  ): Promise<boolean> {
    if (userAId === userBId) return false;
    const [aFollowsB, bFollowsA] = await Promise.all([
      this.followRepo.findOne({
        where: { followerId: userAId, followingId: userBId },
      }),
      this.followRepo.findOne({
        where: { followerId: userBId, followingId: userAId },
      }),
    ]);
    return !!aFollowsB && !!bFollowsA;
  }

  // List paginated messages in a single conversation between viewer
  // and otherUserId. Newest-first; `before` is the createdAt cursor
  // used to page backwards.
  async listConversation(
    viewerId: string,
    otherUserId: string,
    options: { limit?: number; before?: Date } = {},
  ): Promise<ChatMessage[]> {
    if (viewerId === otherUserId) {
      throw new BadRequestException('Cannot chat with yourself');
    }
    const limit = Math.min(options.limit ?? 50, 100);
    const qb = this.messageRepo
      .createQueryBuilder('m')
      .where(
        new Brackets((qb) => {
          qb.where(
            '(m.sender_id = :viewer AND m.recipient_id = :other)',
            { viewer: viewerId, other: otherUserId },
          ).orWhere(
            '(m.sender_id = :other AND m.recipient_id = :viewer)',
            { viewer: viewerId, other: otherUserId },
          );
        }),
      )
      .orderBy('m.created_at', 'DESC')
      .take(limit);
    if (options.before) {
      qb.andWhere('m.created_at < :before', { before: options.before });
    }
    return qb.getMany();
  }

  async sendMessage(
    senderId: string,
    recipientId: string,
    body: string,
  ): Promise<ChatMessage> {
    if (senderId === recipientId) {
      throw new BadRequestException('Cannot send a message to yourself');
    }
    const trimmed = (body ?? '').trim();
    if (trimmed.length === 0) {
      throw new BadRequestException('Message body cannot be empty');
    }

    // Recipient must exist.
    const recipient = await this.userRepo.findOne({
      where: { id: recipientId },
      select: ['id', 'firstName', 'lastName', 'fcmToken'],
    });
    if (!recipient) throw new NotFoundException('Recipient not found');

    // Block check — refuse if either side has blocked the other.
    const blocked = await this.blockRepo.findOne({
      where: [
        { blockerId: senderId, blockedId: recipientId },
        { blockerId: recipientId, blockedId: senderId },
      ],
    });
    if (blocked) {
      throw new BadRequestException(
        'Cannot send a message — one side has blocked the other.',
      );
    }

    // Mutual-follow gate (the "friends" rule): the two users must
    // follow each other in BOTH directions. Pre-existing message
    // history is preserved on either side — only NEW sends are gated.
    const friends = await this._isMutualFollow(senderId, recipientId);
    if (!friends) {
      throw new ForbiddenException(
        'You can only message people who follow you back. Ask them to follow you (or follow them) before starting a chat.',
      );
    }

    const saved = await this.messageRepo.save(
      this.messageRepo.create({
        senderId,
        recipientId,
        body: trimmed,
      }),
    );

    // Live emit to the recipient's user room. The frontend
    // subscribes to `user_<my_id>` on app boot. Wrapped in OnEvent
    // so the gateway can fan out without us depending on it here.
    this.eventEmitter.emit('chat.message', {
      kind: 'new_message',
      senderId,
      recipientId,
      message: saved,
    });

    return saved;
  }

  // Mark every message FROM `otherUserId` TO `viewerId` as read. Idempotent.
  // Returns the number of rows affected so the caller can update its
  // local unread count without another round-trip.
  async markRead(viewerId: string, otherUserId: string): Promise<number> {
    if (viewerId === otherUserId) return 0;
    const result = await this.messageRepo
      .createQueryBuilder()
      .update(ChatMessage)
      .set({ readAt: new Date() })
      .where('sender_id = :other', { other: otherUserId })
      .andWhere('recipient_id = :viewer', { viewer: viewerId })
      .andWhere('read_at IS NULL')
      .execute();
    return result.affected ?? 0;
  }

  // List every "friend" (mutual follower) the viewer is allowed to
  // message. Powers the New Message picker on the conversations list.
  // Flags `alreadyChatting = true` so the picker can mark people the
  // viewer already has an open thread with.
  async listEligibleContacts(viewerId: string): Promise<
    Array<{
      id: string;
      firstName: string | null;
      lastName: string | null;
      username: string | null;
      image: string | null;
      alreadyChatting: boolean;
    }>
  > {
    // Pull both directions in parallel — the intersection is the set
    // of mutual followers.
    const [iFollow, theyFollow] = await Promise.all([
      this.followRepo.find({ where: { followerId: viewerId } }),
      this.followRepo.find({ where: { followingId: viewerId } }),
    ]);
    const iFollowIds = new Set(iFollow.map((f) => f.followingId));
    const theyFollowIds = new Set(theyFollow.map((f) => f.followerId));
    const mutualIds = [...iFollowIds].filter((id) => theyFollowIds.has(id));
    if (mutualIds.length === 0) return [];

    const users = await this.userRepo.find({
      where: { id: In(mutualIds) },
      select: ['id', 'firstName', 'lastName', 'username'],
      relations: ['profile'],
    });

    // Which mutual followers does the viewer already have a thread
    // with? Done as a single light query so the picker can render
    // "Resume" vs "Start" labels without N+1 calls.
    const existingChats = await this.messageRepo
      .createQueryBuilder('m')
      .select('DISTINCT IF(m.sender_id = :viewer, m.recipient_id, m.sender_id)', 'otherId')
      .where('(m.sender_id = :viewer OR m.recipient_id = :viewer)', {
        viewer: viewerId,
      })
      .getRawMany<{ otherId: string }>();
    const chattingWith = new Set(existingChats.map((r) => r.otherId));

    return users.map((u) => ({
      id: u.id,
      firstName: u.firstName ?? null,
      lastName: u.lastName ?? null,
      username: u.username ?? null,
      image: u.profile?.image ?? null,
      alreadyChatting: chattingWith.has(u.id),
    }));
  }

  // Chat-list endpoint: every user the viewer has exchanged messages
  // with, joined with the last message + unread count from that user.
  // Heavier query — one row per other-user, ordered by last activity.
  async listConversations(viewerId: string): Promise<
    Array<{
      otherUserId: string;
      otherUser: Pick<User, 'id' | 'firstName' | 'lastName' | 'username'> & {
        image?: string | null;
      };
      lastMessage: ChatMessage | null;
      unreadCount: number;
    }>
  > {
    // Pull every message the viewer is part of in the last 90 days
    // (cap is just for sanity; bump later if needed).
    const messages = await this.messageRepo
      .createQueryBuilder('m')
      .where('m.sender_id = :viewer OR m.recipient_id = :viewer', {
        viewer: viewerId,
      })
      .orderBy('m.created_at', 'DESC')
      .limit(1000)
      .getMany();
    if (messages.length === 0) return [];

    // Group by "the other user" — the side that isn't the viewer.
    const byOther = new Map<string, ChatMessage[]>();
    for (const m of messages) {
      const other = m.senderId === viewerId ? m.recipientId : m.senderId;
      const arr = byOther.get(other) ?? [];
      arr.push(m);
      byOther.set(other, arr);
    }

    const otherIds = [...byOther.keys()];
    const users = await this.userRepo.find({
      where: { id: In(otherIds) },
      select: ['id', 'firstName', 'lastName', 'username'],
      relations: ['profile'],
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    return otherIds
      .map((otherId) => {
        const all = byOther.get(otherId) ?? [];
        const lastMessage = all[0] ?? null;
        const unreadCount = all.filter(
          (m) => m.recipientId === viewerId && !m.readAt,
        ).length;
        const u = userById.get(otherId);
        return {
          otherUserId: otherId,
          otherUser: {
            id: otherId,
            firstName: u?.firstName ?? null,
            lastName: u?.lastName ?? null,
            username: u?.username ?? null,
            image: u?.profile?.image ?? null,
          },
          lastMessage,
          unreadCount,
        };
      })
      .sort((a, b) => {
        const ta = a.lastMessage?.createdAt?.getTime() ?? 0;
        const tb = b.lastMessage?.createdAt?.getTime() ?? 0;
        return tb - ta;
      });
  }
}
