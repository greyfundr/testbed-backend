import { Entity, Column } from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { AccountType } from '../user.enum';

@Entity('users')
export class User extends AbstractEntity {
  @Column({ unique: true })
  email: string;

  @Column({ select: false })
  password: string;

  @Column({ nullable: true, name: 'first_name' })
  firstName?: string;

  @Column({ nullable: true, name: 'last_name' })
  lastName?: string;

  @Column({ type: 'varchar' })
  accountType: AccountType;

  @Column({ nullable: true, name: 'email_otp' })
  emailOtp: string;

  @Column({ nullable: true, name: 'phone_otp' })
  phoneOtp: string;

  @Column({ default: false, name: 'has_verified_email' })
  hasVerifiedPhone: boolean;
}
