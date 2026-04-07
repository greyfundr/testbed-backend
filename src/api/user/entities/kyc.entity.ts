import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { User } from './user.entity';
import { KycVerificationType, KycStatus, KycLevels } from '../enums/user.enum';

@Entity('kycs')
@Index(['userId', 'name'], { unique: true })
export class Kyc extends AbstractEntity {
  @Index()
  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, (user) => user.kycs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', default: KycLevels.LEVEL_1 })
  name: KycLevels;

  @Column({ type: 'varchar', name: 'verification_type' })
  verificationType: KycVerificationType;

  @Column({ type: 'varchar', name: 'id_number' })
  idNumber: string;

  @Column({ type: 'varchar', nullable: true, name: 'document_image' })
  documentImage: string | null;

  @Column({ type: 'varchar', default: KycStatus.PENDING })
  status: KycStatus;

  @Column({ type: 'text', nullable: true, name: 'rejection_reason' })
  rejectionReason: string | null;

  @Column({ type: 'int', default: 0, name: 'attempt_count' })
  attemptCount: number;

  @Column({ type: 'timestamp', nullable: true, name: 'verified_at' })
  verifiedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true, name: 'rejected_at' })
  rejectedAt: Date | null;
}
