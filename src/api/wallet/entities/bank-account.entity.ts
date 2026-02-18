import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { User } from '../../user/entities';

@Entity('bank_accounts')
@Index(['userId'])
export class BankAccount extends AbstractEntity {
  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'account_number' })
  accountNumber: string;

  @Column({ name: 'account_name' })
  accountName: string;

  @Column({ name: 'bank_name' })
  bankName: string;

  @Column({ name: 'bank_code' })
  bankCode: string;

  @Column({ name: 'recipient_code' })
  recipientCode: string;

  @Column({ default: false, name: 'is_default' })
  isDefault: boolean;

  @Column({ default: true, name: 'is_active' })
  isActive: boolean;

  @Column({ default: false, name: 'is_verified' })
  isVerified: boolean;
}
