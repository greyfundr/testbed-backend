import { Module } from '@nestjs/common';
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

@Module({
  imports: [
    UserModule,
    SettingsModule,
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
  providers: [AuthService, JwtStrategy, TermiiService, OtpAuthService],
  exports: [OtpAuthService],
})
export class AuthModule {}
