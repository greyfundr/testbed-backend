import { Injectable } from '@nestjs/common';
import * as OTPAuth from 'otpauth';
import * as qrcode from 'qrcode';

@Injectable()
export class OtpAuthService {
  private readonly appName: string = 'Greyfundr';
  private readonly algorithm: string = 'SHA1';
  private readonly digits: number = 6;
  private readonly period: number = 30;

  generateOtpSecret(): string {
    const secret = new OTPAuth.Secret({ size: 20 });
    return secret.base32;
  }

  async generateQRCode(secret: string, entityEmail: string): Promise<string> {
    const totp = new OTPAuth.TOTP({
      issuer: this.appName,
      label: `${entityEmail}`,
      algorithm: this.algorithm,
      digits: this.digits,
      period: this.period,
      secret: OTPAuth.Secret.fromBase32(secret),
    });

    const otpauthUrl = totp.toString();

    return await qrcode.toDataURL(otpauthUrl);
  }

  validateOtp(secret: string, token: string): boolean {
    try {
      const totp = new OTPAuth.TOTP({
        issuer: this.appName,
        algorithm: this.algorithm,
        digits: this.digits,
        period: this.period,
        secret,
      });

      const delta = totp.validate({ token, window: 1 });

      return delta !== null;
    } catch (error) {
      console.error('OTP validation error:', error);
      return false;
    }
  }

  async enable2FA<T>(
    entity: T,
    entityId: string,
    entityEmail: string,
    updateFn: (id: string, data: any) => Promise<void>,
  ): Promise<{ secret: string; qrCode: string }> {
    if (!entity) {
      throw new Error(`User not found`);
    }

    const secret = this.generateOtpSecret();

    const qrCode = await this.generateQRCode(secret, entityEmail);

    await updateFn(entityId, {
      twoFactorSecret: secret,
      twoFactorEnabled: false,
    });

    return { secret, qrCode };
  }

  async verify2FA<T>(
    entity: T,
    entityId: string,
    token: string,
    getSecretFn: (entity: T) => string | null,
    updateFn: (id: string, data: any) => Promise<void>,
  ): Promise<boolean> {
    const secret = getSecretFn(entity);

    if (!entity || !secret) {
      throw new Error(`User not found or 2FA not initialized`);
    }

    const isValid = this.validateOtp(secret, token);

    if (isValid) {
      await updateFn(entityId, {
        twoFactorEnabled: true,
      });
      return true;
    }

    return false;
  }

  validate2FALogin<T>(
    token: string,
    secret: string,
    isEnabled: boolean,
  ): boolean {
    if (!isEnabled || !secret) {
      throw new Error(`User not found or 2FA not enabled`);
    }

    return this.validateOtp(secret, token);
  }

  async disable2FA<T>(
    entity: T,
    entityId: string,
    token: string,
    getSecretFn: (entity: T) => string | null,
    isEnabledFn: (entity: T) => boolean,
    updateFn: (id: string, data: any) => Promise<void>,
  ): Promise<boolean> {
    const secret = getSecretFn(entity);
    const isEnabled = isEnabledFn(entity);

    if (!entity || !isEnabled || !secret) {
      throw new Error(`User not found or 2FA not enabled`);
    }

    const isValid = this.validateOtp(secret, token);

    if (isValid) {
      await updateFn(entityId, {
        twoFactorEnabled: false,
        twoFactorSecret: null,
      });
      return true;
    }

    return false;
  }
}
