import { Entity, Column, OneToOne } from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { AccountType } from '../enums/user.enum';
import { Settings } from '../../settings/entities/settings.entity';

@Entity('users')
export class User extends AbstractEntity {
  @Column({ unique: true })
  email: string;

  @Column({ unique: true, name: 'phone_number' })
  phoneNumber: string;

  @Column()
  password: string;

  @Column({ type: 'varchar', nullable: true, name: 'first_name' })
  firstName: string | null;

  @Column({ type: 'varchar', nullable: true, name: 'last_name' })
  lastName: string | null;

  @Column({ type: 'varchar', unique: true, nullable: true })
  username: string | null;

  @Column({ type: 'varchar', name: 'account_type' })
  accountType: AccountType;

  @Column({ nullable: true, name: 'email_otp' })
  emailOtp: string;

  @Column({ nullable: true, name: 'phone_otp' })
  phoneOtp: string;

  @Column({ default: false, name: 'has_verified_email' })
  hasVerifiedPhone: boolean;

  @Column({ type: 'date', nullable: true, name: 'otp_expiration' })
  otpExpiration: Date | null;

  @Column({ default: false, name: 'has_submitted_basic_info' })
  hasSubmittedBasicInfo: boolean;

  @Column({ default: false, name: 'has_completed_kyc' })
  hasCompletedKyc: boolean;

  @Column({ default: false, name: 'agree_to_terms' })
  agreeToTerms: boolean;

  @Column({ type: 'varchar', nullable: true, name: 'cac_number' })
  cacNumber: string | null;

  @Column({ type: 'varchar', nullable: true, name: 'company_name' })
  companyName: string | null;

  @Column({ type: 'varchar', nullable: true, name: 'tin' })
  tin: string | null;

  @OneToOne(() => Settings, (settings) => settings.user, { cascade: true })
  settings: Settings;
}
