import { forwardRef, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './controllers/auth.controller';
import { AuthService } from './services/auth.service';
import { UserModule } from '../user/user.module';
import { SettingsModule } from '../settings/settings.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TermiiService } from '../../common/services/termii.service';
import { OtpAuthService } from './services';
import { WalletModule } from '../wallet/wallet.module';
import { WhatsAppService } from '../../common/services/whatsapp.service';

@Module({
  imports: [
    forwardRef(() => UserModule),
    SettingsModule,
    forwardRef(() => WalletModule),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'secretKey',
        signOptions: { expiresIn: '1d' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    TermiiService,
    OtpAuthService,
    WhatsAppService,
  ],
  exports: [OtpAuthService, AuthService],
})
export class AuthModule {}
