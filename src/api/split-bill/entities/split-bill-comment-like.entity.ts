import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
  CreateDateColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../user/entities';
import { SplitBillComment } from './split-bill-comment.entity';

// One row per (commentId, userId) — UNIQUE so a user can like a given
// comment at most once. Toggle-off deletes the row. Cascades from
// comment + user so the row is cleaned up automatically when either
// is removed.
@Entity('split_bill_comment_likes')
@Unique('uq_sbcl_comment_user', ['commentId', 'userId'])
@Index('idx_sbcl_comment', ['commentId'])
export class SplitBillCommentLike {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'comment_id' })
  commentId: string;

  @ManyToOne(() => SplitBillComment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'comment_id' })
  comment: SplitBillComment;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
