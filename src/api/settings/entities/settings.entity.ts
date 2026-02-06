import { Entity, Column, OneToOne, JoinColumn } from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { User } from '../../user/entities/user.entity';
import {
    NotificationPreferences,
    PrivacyControls,
} from '../interface/settings.interface';

@Entity('settings')
export class Settings extends AbstractEntity {
    @OneToOne(() => User, (user) => user.settings, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column('json', { nullable: false })
    notificationPrefs: NotificationPreferences;

    @Column('json', { nullable: false })
    privacyControls: PrivacyControls;

    @Column({ default: 'en' })
    language: string;

    @Column({ default: 'NGN' })
    currency: string;

    @Column({ default: false, name: 'two_factor_enabled' })
    twoFactorEnabled: boolean;

    @Column({ nullable: true, name: 'two_factor_secret' })
    twoFactorSecret: string;

    @Column({ default: false, name: 'email_verified' })
    emailVerified: boolean;

    @Column({ default: false, name: 'phone_verified' })
    phoneVerified: boolean;
}
