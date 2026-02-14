import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationService } from './services/notification.service';
import { MailtrapService } from './services/mailtrap.service';
import { FirebaseService } from './services/firebase.service';
import { NotificationListener } from './listeners/notification.listener';
import { SettingsModule } from '../settings/settings.module';
import { CommonModule } from '../../common/common.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Notification]),
        SettingsModule,
        CommonModule,
    ],
    providers: [
        NotificationService,
        MailtrapService,
        FirebaseService,
        NotificationListener,
    ],
    exports: [NotificationService],
})
export class NotificationModule { }
