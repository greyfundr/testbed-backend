import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { Wallet } from './wallet.entity';
import { Transaction } from '../../transaction/entities/transaction.entity';

export enum WithdrawalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

@Entity('withdrawal_requests')
@Index(['walletId', 'status'])
export class WithdrawalRequest extends AbstractEntity {
  @Column({ name: 'wallet_id' })
  walletId: string;

  @ManyToOne(() => Wallet)
  @JoinColumn({ name: 'wallet_id' })
  wallet: Wallet;

  @Column({ type: 'bigint' })
  amount: number;

  @Column({ default: 'NGN' })
  currency: string;

  @Column({ name: 'recipient_code' })
  recipientCode: string; // e.g. "RCP_xxxx"

  // Bank details snapshot at time of request (denormalized for audit)
  @Column({ type: 'json', name: 'bank_details' })
  bankDetails: {
    bankName: string;
    bankCode: string;
    accountNumber: string;
    accountName: string;
  };

  @Column({ type: 'varchar', default: WithdrawalStatus.PENDING })
  status: WithdrawalStatus;

  @Column({ nullable: true, name: 'transaction_id' })
  transactionId: string | null;

  @ManyToOne(() => Transaction, { nullable: true })
  @JoinColumn({ name: 'transaction_id' })
  transaction: Transaction | null;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'payment_transfer_code',
  })
  paymentTransferCode: string | null;

  @Column({ type: 'text', nullable: true, name: 'failure_reason' })
  failureReason: string | null;
}
