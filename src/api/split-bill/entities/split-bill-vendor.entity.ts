import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { SplitBill } from './split-bill.entity';
import { SplitBillVendorKind } from '../enums/split-bill.enum';

// Beneficiary record attached to a split bill. Mirrors
// `campaign_vendors`. Once a vendor exists on a bill, participants
// can propose a disbursement to that vendor through the governance
// flow.
@Entity('split_bill_vendors')
export class SplitBillVendor extends AbstractEntity {
  @Column({ name: 'split_bill_id', length: 36 })
  splitBillId: string;

  @ManyToOne(() => SplitBill, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'split_bill_id' })
  splitBill: SplitBill;

  @Column({ length: 120 })
  name: string;

  @Column({
    type: 'enum',
    enum: SplitBillVendorKind,
    default: SplitBillVendorKind.VENDOR,
  })
  kind: SplitBillVendorKind;

  @Column({
    type: 'varchar',
    name: 'bank_name',
    length: 120,
    nullable: true,
  })
  bankName?: string | null;

  @Column({
    type: 'varchar',
    name: 'account_name',
    length: 120,
    nullable: true,
  })
  accountName?: string | null;

  @Column({
    type: 'varchar',
    name: 'account_number',
    length: 32,
    nullable: true,
  })
  accountNumber?: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  contact?: string | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;
}
