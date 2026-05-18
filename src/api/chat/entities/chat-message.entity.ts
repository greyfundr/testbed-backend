import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { User } from '../../user/entities';

// One direct message between two users. Conversation = union of rows
// where (sender, recipient) is either (A, B) or (B, A).
//
// MVP: text body only; no attachments, no reactions, no per-message
// edit. We'll layer those in once the UI is finalised.
@Entity('chat_messages')
@Index('idx_chat_messages_sender_recipient_created', [
  'senderId',
  'recipientId',
  'createdAt',
])
@Index('idx_chat_messages_recipient_sender_created', [
  'recipientId',
  'senderId',
  'createdAt',
])
@Index('idx_chat_messages_recipient_read', ['recipientId', 'readAt'])
export class ChatMessage extends AbstractEntity {
  @Column({ name: 'sender_id', length: 36 })
  senderId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sender_id' })
  sender?: User;

  @Column({ name: 'recipient_id', length: 36 })
  recipientId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recipient_id' })
  recipient?: User;

  @Column({ type: 'text' })
  body: string;

  // Stamped when the recipient marks the thread as read (visiting
  // the chat screen). Null while still unread; powers the chat-list
  // unread bubbles and the user-room badge.
  @Column({
    name: 'read_at',
    type: 'timestamp',
    precision: 6,
    nullable: true,
  })
  readAt?: Date | null;
}
