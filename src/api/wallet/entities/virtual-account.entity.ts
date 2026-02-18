import { Entity, Column, OneToOne, JoinColumn, Index } from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { Wallet } from './wallet.entity';
import { VirtualAccountStatus } from '../enums/wallet.enum';

@Entity('virtual_accounts')
export class VirtualAccount extends AbstractEntity {
  @OneToOne(() => Wallet, (wallet) => wallet.virtualAccount, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'wallet_id' })
  wallet: Wallet;

  @Column({ name: 'wallet_id' })
  walletId: string;

  @Index({ unique: true })
  @Column({ name: 'account_number' })
  accountNumber: string; 

  @Column({ name: 'account_name' })
  accountName: string; 

  @Column({ name: 'bank_name' })
  bankName: string; 

  @Column({ name: 'bank_code' })
  bankCode: string;

  @Column({ name: 'paystack_customer_id' })
  paystackCustomerId: string; 

  @Column({ name: 'paystack_customer_code' })
  paystackCustomerCode: string;

  @Column({ name: 'paystack_dva_id', nullable: true })
  paystackDvaId: string;

  @Column({
    type: 'varchar',
    default: VirtualAccountStatus.ACTIVE,
  })
  status: VirtualAccountStatus;

  @Column({ default: false, name: 'is_assigned' })
  isAssigned: boolean;

  @Column({ type: 'json', nullable: true, name: 'paystack_meta' })
  paystackMeta: Record<string, any>;
}
