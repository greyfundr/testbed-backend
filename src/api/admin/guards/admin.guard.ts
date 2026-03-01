import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class AdminJwtAuthGuard extends AuthGuard('admin-jwt') {
  handleRequest(err, user, info) {
    if (err || !user) {
      throw err || new UnauthorizedException('Admin authentication failed');
    }
    return user;
  }
}
