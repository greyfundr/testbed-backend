import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminRepository } from '../repository/admin.repository';

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(
    private configService: ConfigService,
    private adminRepository: AdminRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'secretKey',
    });
  }

  async validate(payload: any) {
    // Check if the token was specifically minted for an admin (optional security check)
    if (payload.type !== 'admin') {
      throw new UnauthorizedException('Invalid token type');
    }

    const admin = await this.adminRepository.findOne({
      where: { id: payload.sub },
    });
    if (!admin) {
      throw new UnauthorizedException('Admin not found');
    }
    return admin;
  }
}
