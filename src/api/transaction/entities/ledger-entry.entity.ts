import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { Transaction } from './transaction.entity';
import { Wallet } from '../../wallet/entities/wallet.entity';
import {
  LedgerAccountType,
  TransactionDirection,
} from '../enums/transaction.enum';

/**
 * Every financial event produces EXACTLY TWO ledger entries:
 * one DEBIT and one CREDIT that net to zero.
 *
 * Example — User funds wallet via DVA:
 *   DEBIT  payment_gateway        500_000 kobo
 *   CREDIT user_wallet (walletId)  500_000 kobo
 *
 * Example — User donates to campaign:
 *   DEBIT  user_wallet             500_000 kobo
 *   CREDIT campaign_escrow         500_000 kobo
 */
@Entity('ledger_entries')
@Index(['walletId', 'createdAt'])
@Index(['transactionId'])
@Index(['accountType'])
export class LedgerEntry extends AbstractEntity {
  @Column({ name: 'transaction_id' })
  transactionId: string;

  @ManyToOne(() => Transaction, (tx) => tx.ledgerEntries)
  @JoinColumn({ name: 'transaction_id' })
  transaction: Transaction;

  // walletId is nullable — non-wallet accounts (gateway, escrow) don't have one
  @Column({ nullable: true, name: 'wallet_id' })
  walletId: string | null;

  @ManyToOne(() => Wallet, (wallet) => wallet.ledgerEntries, { nullable: true })
  @JoinColumn({ name: 'wallet_id' })
  wallet: Wallet | null;

  @Column({ type: 'varchar', name: 'account_type' })
  accountType: LedgerAccountType;

  // The entity this ledger entry is scoped to when accountType is escrow
  // e.g. campaignId or billId
  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'account_entity_id',
  })
  accountEntityId: string | null;

  @Column({ type: 'varchar' })
  direction: TransactionDirection;

  @Column({ type: 'bigint' })
  amount: number; // in kobo

  @Column({ default: 'NGN' })
  currency: string;

  // Running balance snapshot at the time of entry (for this wallet only)
  @Column({ type: 'bigint', nullable: true, name: 'running_balance' })
  runningBalance: number | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;
}
