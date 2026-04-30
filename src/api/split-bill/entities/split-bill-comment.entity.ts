import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  DeleteDateColumn,
} from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { User } from '../../user/entities';
import { SplitBill } from './split-bill.entity';
import { SplitBillParticipant } from './split-bill-participant.entity';

@Entity('split_bill_comments')
@Index(['splitBillId', 'createdAt'])
@Index(['authorId', 'createdAt'])
export class SplitBillComment extends AbstractEntity {
  @Index()
  @Column({ name: 'split_bill_id' })
  splitBillId: string;

  @ManyToOne(() => SplitBill, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'split_bill_id' })
  splitBill: SplitBill;

  @Index()
  @Column({ name: 'participant_id' })
  participantId: string;

  @ManyToOne(() => SplitBillParticipant, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'participant_id' })
  participant: SplitBillParticipant;

  @Index()
  @Column({ type: 'varchar', nullable: true, name: 'author_id' })
  authorId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'author_id' })
  author: User | null;

  @Column({ type: 'varchar', length: 20, nullable: true, name: 'guest_phone' })
  guestPhone: string | null;

  @Column({ type: 'varchar', length: 255, name: 'display_name' })
  displayName: string;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'display_type',
    default: 'full_name',
  })
  displayType: 'full_name' | 'username' | 'anonymous' | 'guest';

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'varchar', nullable: true, name: 'transaction_id' })
  transactionId: string | null;

  @Column({ type: 'boolean', default: false, name: 'is_pinned' })
  isPinned: boolean;

  @Column({ type: 'boolean', default: false, name: 'is_edited' })
  isEdited: boolean;

  @Column({ type: 'timestamp', nullable: true, name: 'edited_at' })
  editedAt: Date | null;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
