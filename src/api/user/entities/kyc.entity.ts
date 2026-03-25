import { Entity, Column, OneToOne, JoinColumn } from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { User } from './user.entity';
import { KycVerificationType, KycStatus, KycLevels } from '../enums/user.enum';

@Entity('kycs')
export class Kyc extends AbstractEntity {
  @Column({ type: 'varchar', default: KycLevels.LEVEL_1 })
  name: KycLevels;

  @Column({
    type: 'varchar',
    name: 'verification_type',
  })
  verificationType: KycVerificationType;

  @Column({ type: 'varchar', name: 'id_number' })
  idNumber: string;

  @Column({ type: 'varchar', nullable: true, name: 'document_image' })
  documentImage: string | null;

  @Column({
    type: 'varchar',
    default: KycStatus.PENDING,
  })
  status: KycStatus;

  @Column({ type: 'text', nullable: true, name: 'rejection_reason' })
  rejectionReason: string | null;

  @OneToOne(() => User, (user) => user.kyc)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
