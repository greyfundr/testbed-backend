import {
  Entity,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { Wallet } from '../../wallet/entities/wallet.entity';
import { LedgerEntry } from './ledger-entry.entity';
import {
  TransactionType,
  TransactionStatus,
  TransactionDirection,
} from '../enums/transaction.enum';

@Entity('transactions')
@Index(['walletId', 'createdAt'])
@Index(['reference'])
@Index(['gatewayReference'])
@Index(['type', 'status'])
export class Transaction extends AbstractEntity {
  @Column({ name: 'wallet_id' })
  walletId: string;

  @ManyToOne(() => Wallet, (wallet) => wallet.transactions)
  @JoinColumn({ name: 'wallet_id' })
  wallet: Wallet;

  @Column({ type: 'bigint' })
  amount: number;

  @Column({ default: 'NGN' })
  currency: string;

  @Column({ type: 'varchar' })
  type: TransactionType;

  @Column({ type: 'varchar' })
  direction: TransactionDirection;

  @Column({ type: 'varchar', default: TransactionStatus.PENDING })
  status: TransactionStatus;

  @Column({ unique: true })
  reference: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'gateway_reference',
  })
  gatewayReference: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'idempotency_key',
  })
  idempotencyKey: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text', nullable: true, name: 'failure_reason' })
  failureReason: string | null;

  // Polymorphic source reference — what triggered this transaction
  // e.g. { entity: 'campaign', id: 'uuid' }
  //      { entity: 'split_bill', id: 'uuid' }
  //      { entity: 'invoice', id: 'uuid' }
  @Column({ type: 'json', nullable: true, name: 'source_ref' })
  sourceRef: { entity: string; id: string } | null;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'counterparty_wallet_id',
  })
  counterpartyWalletId: string | null;

  @Column({ type: 'bigint', default: 0, name: 'fee_amount' })
  feeAmount: number;

  @Column({ type: 'json', nullable: true, name: 'gateway_response' })
  gatewayResponse: Record<string, any> | null;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any> | null;

  @Column({ type: 'timestamp', nullable: true, name: 'confirmed_at' })
  confirmedAt: Date | null;

  @OneToMany(() => LedgerEntry, (le) => le.transaction)
  ledgerEntries: LedgerEntry[];
}
