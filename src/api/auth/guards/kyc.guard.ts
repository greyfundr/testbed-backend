import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SetMetadata } from '@nestjs/common';
import { UserRepository } from '../../user/repository';

// Decorator to skip KYC check on specific routes even when guard is applied globally
export const SKIP_KYC_KEY = 'skipKyc';
export const SkipKyc = () => SetMetadata(SKIP_KYC_KEY, true);

@Injectable()
export class KycGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly userRepo: UserRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Allow routes decorated with @SkipKyc() to bypass this guard
    const skipKyc = this.reflector.getAllAndOverride<boolean>(SKIP_KYC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skipKyc) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not found');
    }

    // if (!user.hasCompletedKyc) {
    //   throw new ForbiddenException(
    //     'Identity verification required. Please complete KYC to access this feature.',
    //   );
    // }

    request.user.kycCompleted = true;

    return true;
  }
}
