import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { SplitBill } from './split-bill.entity';

// Creator-authored announcement posted on a bill's Updates tab.
// Visible to every participant. Mirrors `campaign_updates`.
@Entity('split_bill_updates')
@Index('idx_sbu_bill_created', ['splitBillId', 'createdAt'])
export class SplitBillUpdate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'split_bill_id', length: 255 })
  splitBillId: string;

  @Column({ name: 'author_id', length: 255 })
  authorId: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'tinyint', default: 0 })
  pinned: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => SplitBill, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'split_bill_id' })
  splitBill: SplitBill;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'author_id' })
  author: User;
}
