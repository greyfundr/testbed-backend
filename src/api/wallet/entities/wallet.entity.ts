import {
  Entity,
  Column,
  OneToOne,
  OneToMany,
  JoinColumn,
  Index,
  VersionColumn,
} from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { User } from '../../user/entities';
import { VirtualAccount } from './virtual-account.entity';
import { Transaction, LedgerEntry } from '../../transaction/entities';
import { WalletStatus, WalletCurrency } from '../enums/wallet.enum';
import { BigIntAmountTransformer } from '../../../common/transformers/column-numeric.transformer';

@Entity('wallets')
@Index(['userId'], { unique: true })
export class Wallet extends AbstractEntity {
  @Column({ name: 'user_id' })
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    type: 'bigint',
    default: 0,
    name: 'available_balance',
    transformer: new BigIntAmountTransformer(),
  })
  availableBalance: number;

  @Column({
    type: 'bigint',
    default: 0,
    name: 'ledger_balance',
    transformer: new BigIntAmountTransformer(),
  })
  ledgerBalance: number;

  @Column({
    type: 'bigint',
    default: 0,
    name: 'escrow_balance',
    transformer: new BigIntAmountTransformer(),
  })
  escrowBalance: number;

  @Column({
    type: 'bigint',
    default: 0,
    name: 'lifetime_credited',
    transformer: new BigIntAmountTransformer(),
  })
  lifetimeCredited: number;

  @Column({
    type: 'bigint',
    default: 0,
    name: 'lifetime_debited',
    transformer: new BigIntAmountTransformer(),
  })
  lifetimeDebited: number;

  @Column({
    type: 'varchar',
    default: WalletCurrency.NGN,
  })
  currency: WalletCurrency;

  @Column({
    type: 'varchar',
    default: WalletStatus.ACTIVE,
  })
  status: WalletStatus;

  @Column({ type: 'text', nullable: true, name: 'freeze_reason' })
  freezeReason: string | null;

  @VersionColumn()
  version: number;

  @OneToOne(() => VirtualAccount, (va) => va.wallet, { cascade: true })
  virtualAccount: VirtualAccount;

  @OneToMany(() => Transaction, (tx) => tx.wallet)
  transactions: Transaction[];

  @OneToMany(() => LedgerEntry, (le) => le.wallet)
  ledgerEntries: LedgerEntry[];
}
