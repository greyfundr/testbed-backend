import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { SplitBill } from './split-bill.entity';

@Entity('split_bill_likes')
@Unique(['splitBillId', 'userId'])
export class SplitBillLike {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'split_bill_id', length: 36 })
  splitBillId: string;

  @Column({ name: 'user_id', length: 36 })
  userId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => SplitBill, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'split_bill_id' })
  splitBill: SplitBill;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
