import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  CompleteKycDto,
  ForgotPasswordDto,
  LoginDto,
  SignupDto,
  SubmitBasicInfoDto,
  VerifyOtpDto,
  LoginPinDto,
  ResendOtpDto,
  ChangePasswordDto,
  ChangePinDto,
  ResetPasswordDto,
  VerifyResetOtpDto,
} from '../auth.dto';
import { UserRepository } from '../../user/repository';
import { generateNumericToken } from '../../../common/helpers/token-generator';
import { TermiiService } from '../../../common/services/termii.service';
import * as bcrypt from 'bcrypt';
import { SettingsService } from '../../settings/services';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OtpAuthService } from './otp-auth.service';
import { WalletService } from '../../wallet/services';
import { AccountType } from '../../user/enums/user.enum';
import * as crypto from 'crypto';
import { WhatsAppService } from 'src/common/services/whatsapp.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    private readonly userRepository: UserRepository,
    private readonly jwtService: JwtService,
    private readonly smsService: TermiiService,
    private readonly settingsService: SettingsService,
    private readonly eventEmitter: EventEmitter2,
    private readonly walletService: WalletService,
    private readonly whatsAppService: WhatsAppService,
    @Inject(OtpAuthService) private readonly otpAuthService: OtpAuthService,
  ) {}

  async signup(params: SignupDto) {
    const queryRunner = this.userRepository
      .getManager()
      .connection.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    let committed = false;

    try {
      const { email, phoneNumber, password, accountType } = params;

      const [existingEmail, existingPhone] = await Promise.all([
        this.userRepository.findOne({ where: { email } }),
        this.userRepository.findOne({ where: { phoneNumber } }),
      ]);

      if (existingEmail) throw new ConflictException('Email already exists');
      if (existingPhone)
        throw new ConflictException('Phone number already exists');

      const hashedPassword = await bcrypt.hash(password, 10);
      const otp = generateNumericToken(6);
      const otpExpiration = new Date(Date.now() + 5 * 60 * 1000);

      const user = await this.userRepository.create(
        {
          email,
          password: hashedPassword,
          accountType,
          phoneOtp: otp,
          emailOtp: otp,
          phoneNumber,
          otpExpiration,
        },
        queryRunner.manager,
      );

      await queryRunner.manager.save(user);

      await this.settingsService.createDefaultSettings(
        user.id,
        queryRunner.manager,
      );

      await this.walletService.createWalletForUser(
        { id: user.id },
        queryRunner,
      );

      await queryRunner.commitTransaction();
      committed = true;

      this.eventEmitter.emit('user.created', {
        userId: user.id,
        email: user.email,
        phoneNumber: user.phoneNumber,
      });

      this.eventEmitter.emit('user.created', {
        userId: user.id,
        email: user.email,
        phoneNumber: user.phoneNumber,
        otp,
      });

      return { message: 'Account created. Please verify your phone number.' };
    } catch (error) {
      if (!committed) {
        await queryRunner.rollbackTransaction();
      }
      this.logger.error('Unable to signup user', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async login(params: LoginDto) {
    this.logger.log(`Login attempt for ${params.emailOrPhone}`);
    const user = await this.userRepository.findOne({
      where: [
        { email: params.emailOrPhone },
        { phoneNumber: params.emailOrPhone },
      ],
      select: [
        'id',
        'password',
        'firstName',
        'lastName',
        'email',
        'phoneNumber',
        'accountType',
        'hasVerifiedPhone',
        'hasCompletedKyc',
      ],
    });

    if (!user) throw new BadRequestException('Invalid credentials');

    const isPasswordValid = await bcrypt.compare(
      params.password,
      user.password,
    );

    if (!isPasswordValid) throw new BadRequestException('Invalid credentials');

    if (!user.hasVerifiedPhone) {
      const phoneOtp = generateNumericToken(6);
      const otpExpiration = new Date(Date.now() + 5 * 60 * 1000);
      user.phoneOtp = phoneOtp;
      user.otpExpiration = otpExpiration;
      await this.userRepository.save(user);

      await this.smsService.sendSMS(
        user.phoneNumber,
        `Your OTP is ${phoneOtp}`,
      );

      return {
        data: {
          id: user.id,
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          email: user.email,
          phoneNumber: user.phoneNumber,
          accountType: user.accountType,
          hasVerifiedPhone: user.hasVerifiedPhone,
        },
        accessToken: null,
        refreshToken: null,
      };
    }

    const tokens = await this.generateTokens(user.id);
    await this.updateRefreshToken(user.id, tokens.refreshToken);
    return {
      data: {
        id: user.id,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email,
        phoneNumber: user.phoneNumber,
        accountType: user.accountType,
        hasVerifiedPhone: user.hasVerifiedPhone,
      },
      ...tokens,
    };
  }

  async verifyOtp(params: VerifyOtpDto) {
    try {
      const user = await this.userRepository.findOne({
        where: [
          { email: params.emailOrPhone },
          { phoneNumber: params.emailOrPhone },
        ],
      });

      if (!user) throw new NotFoundException('Account not found');

      const currentDate = new Date();
      if (currentDate > user.otpExpiration!)
        throw new NotFoundException('OTP expired');

      if (user.phoneOtp !== params.otp) {
        throw new BadRequestException('Invalid OTP');
      }

      user.hasVerifiedPhone = true;
      user.otpExpiration = null;
      await this.userRepository.save(user);
      const tokens = await this.generateTokens(user.id);
      await this.updateRefreshToken(user.id, tokens.refreshToken);
      return tokens;
    } catch (error) {
      this.logger.error('Unable to verify OTP', error);
      throw error;
    }
  }

  async resendOtp(params: ResendOtpDto) {
    try {
      const { emailOrPhone } = params;

      const user = await this.userRepository.findOne({
        where: [{ email: emailOrPhone }, { phoneNumber: emailOrPhone }],
      });

      if (!user) throw new NotFoundException('Account not found');

      if (user.hasVerifiedPhone) {
        throw new BadRequestException('Account is already verified');
      }

      const otp = generateNumericToken(6);
      const otpExpiration = new Date(Date.now() + 5 * 60 * 1000);

      user.phoneOtp = otp;
      user.emailOtp = otp;
      user.otpExpiration = otpExpiration;

      await this.userRepository.save(user);

      await this.smsService.sendSMS(user.phoneNumber, otp);

      this.eventEmitter.emit('verify.otp', {
        userId: user.id,
        email: user.email,
        phoneNumber: user.phoneNumber,
        otp,
      });

      return { message: 'OTP sent successfully. It expires in 5 minutes.' };
    } catch (error) {
      this.logger.error('Unable to resend OTP', error);
      throw error;
    }
  }

  async forgotPassword(params: ForgotPasswordDto) {
    try {
      const user = await this.userRepository.findOne({
        where: [
          {
            email: params.emailOrPhone,
          },
          {
            phoneNumber: params.emailOrPhone,
          },
        ],
      });

      if (!user) throw new NotFoundException('Account not found');
      const otp = generateNumericToken(6);
      const otpExpiration = new Date(Date.now() + 5 * 60 * 1000);

      user.phoneOtp = otp;
      user.emailOtp = otp;
      user.otpExpiration = otpExpiration;
      await this.userRepository.save(user);

      //TODO: Add proper sms message for OTP
      await this.smsService.sendSMS(user.phoneNumber, `Your OTP is ${otp}`);
    } catch (error) {
      this.logger.error('Unable to send OTP', error);
      throw error;
    }
  }

  async verifyResetOtp(params: VerifyResetOtpDto): Promise<string> {
    const user = await this.userRepository.findOne({
      where: [
        { email: params.emailOrPhone },
        { phoneNumber: params.emailOrPhone },
      ],
      select: ['id', 'phoneOtp', 'emailOtp', 'otpExpiration'],
    });

    if (!user) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    const isExpired = !user.otpExpiration || user.otpExpiration < new Date();
    if (isExpired) {
      throw new UnauthorizedException(
        'OTP has expired. Please request a new one.',
      );
    }

    const otpValid =
      user.phoneOtp === params.otp || user.emailOtp === params.otp;

    if (!otpValid) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    const resetTokenExpiry = new Date(Date.now() + 15 * 60 * 1000);

    await this.userRepository.update(
      { id: user.id },
      {
        phoneOtp: '',
        emailOtp: '',
        otpExpiration: null,
        passwordResetToken: hashedToken,
        passwordResetTokenExpiry: resetTokenExpiry,
      },
    );

    this.logger.log(`Reset OTP verified for user ${user.id}`);

    return resetToken;
  }

  async resetPassword(params: ResetPasswordDto): Promise<void> {
    if (params.newPassword !== params.confirmNewPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const hashedToken = crypto
      .createHash('sha256')
      .update(params.resetToken)
      .digest('hex');

    const user = await this.userRepository.findOne({
      where: { passwordResetToken: hashedToken },
      select: [
        'id',
        'email',
        'phoneNumber',
        'password',
        'passwordResetTokenExpiry',
      ],
    });

    if (!user) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    if (
      !user.passwordResetTokenExpiry ||
      user.passwordResetTokenExpiry < new Date()
    ) {
      await this.userRepository.update(
        { id: user.id },
        { passwordResetToken: null, passwordResetTokenExpiry: null },
      );
      throw new UnauthorizedException(
        'Reset token has expired. Please restart the forgot-password flow.',
      );
    }

    if (user.password) {
      const isSamePassword = await bcrypt.compare(
        params.newPassword,
        user.password,
      );
      if (isSamePassword) {
        throw new BadRequestException(
          'New password must be different from your current password',
        );
      }
    }

    const hashedPassword = await bcrypt.hash(params.newPassword, 12);

    await this.userRepository.update(
      { id: user.id },
      {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetTokenExpiry: null,
      },
    );

    this.logger.log(`Password reset successfully for user ${user.id}`);

    this.eventEmitter.emit('security.password_changed', {
      userId: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber ?? undefined,
      changedAt: new Date(),
    });
  }

  async changePassword(
    params: ChangePasswordDto,
    userId: string,
  ): Promise<void> {
    if (params.newPassword !== params.confirmNewPassword) {
      throw new BadRequestException(
        'New password and confirmation do not match',
      );
    }

    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'password', 'email', 'phoneNumber'],
    });

    if (!user) throw new NotFoundException('Account not found');

    if (!user.password) {
      throw new BadRequestException(
        'Your account has no password set. Use the create-password endpoint instead.',
      );
    }

    const currentPasswordValid = await bcrypt.compare(
      params.currentPassword,
      user.password,
    );
    if (!currentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const isSamePassword = await bcrypt.compare(
      params.newPassword,
      user.password,
    );
    if (isSamePassword) {
      throw new BadRequestException(
        'New password must be different from your current password',
      );
    }

    const hashedPassword = await bcrypt.hash(params.newPassword, 12);

    await this.userRepository.update(
      { id: userId },
      { password: hashedPassword },
    );

    this.logger.log(`Password changed for user ${userId}`);

    this.eventEmitter.emit('security.password_changed', {
      userId: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber ?? undefined,
      changedAt: new Date(),
    });
  }

  async submitBasicInfo(params: SubmitBasicInfoDto, userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) throw new NotFoundException('Account not found');

    user.firstName = params.firstName;
    user.lastName = params.lastName;
    user.agreeToTerms = params.agreeToTerms;
    user.username = params.username;
    user.hasSubmittedBasicInfo = true;
    user.dateOfBirth = new Date(params.dateOfBirth);

    await this.userRepository.save(user);
  }

  async completeKyc(params: CompleteKycDto, userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Account not found');
    }

    if (user.hasCompletedKyc) {
      throw new BadRequestException('KYC already completed');
    }

    if (user.accountType === AccountType.BUSINESS) {
      const { cacNumber, companyName, tin } = params;

      if (!cacNumber || !companyName || !tin) {
        throw new BadRequestException(
          'CAC number, company name and TIN are required for business accounts',
        );
      }

      user.cacNumber = cacNumber;
      user.companyName = companyName;
      user.tin = tin;
    }

    if (user.accountType === AccountType.PERSONAL) {
      user.cacNumber = null;
      user.companyName = null;
      user.tin = null;
    }

    user.hasCompletedKyc = true;

    await this.userRepository.save(user);

    return {
      message: 'KYC completed successfully',
    };
  }

  async refreshTokens(refreshToken: string) {
    let payload;
    try {
      payload = await this.jwtService.verifyAsync(refreshToken);
    } catch (error) {
      throw new ForbiddenException('Access Denied');
    }

    const userId = payload.sub;
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });
    if (!user || !user.refreshToken)
      throw new ForbiddenException('Access Denied');

    const refreshTokenMatches = await bcrypt.compare(
      refreshToken,
      user.refreshToken,
    );
    if (!refreshTokenMatches) throw new ForbiddenException('Access Denied');

    const tokens = await this.generateTokens(user.id);
    await this.updateRefreshToken(user.id, tokens.refreshToken);
    return tokens;
  }

  async updateRefreshToken(userId: string, refreshToken: string) {
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    await this.userRepository.update(
      { id: userId },
      { refreshToken: hashedRefreshToken },
    );
  }

  async generateTokens(userId: string) {
    const payload = { sub: userId };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        expiresIn: '1h',
      }),
      this.jwtService.signAsync(payload, {
        expiresIn: '7d',
      }),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }

  async setPin(userId: string, pin: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'pin'],
    });

    if (!user) {
      throw new NotFoundException('Account not found');
    }

    if (user.pin) {
      throw new ConflictException(
        'A PIN is already set on this account. Use the change-pin endpoint to update it.',
      );
    }

    const hashedPin = await bcrypt.hash(pin, 12);

    await this.userRepository.update({ id: userId }, { pin: hashedPin });

    this.logger.log(`PIN set for user ${userId}`);

    return {
      success: true,
      message: 'PIN set successfully',
    };
  }

  async changePin(userId: string, params: ChangePinDto) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'pin'],
    });

    if (!user) {
      throw new NotFoundException('Account not found');
    }

    if (!user.pin) {
      throw new BadRequestException(
        'No PIN is set on this account. Use the set-pin endpoint first.',
      );
    }

    const currentPinValid = await bcrypt.compare(params.currentPin, user.pin);

    if (!currentPinValid) {
      throw new UnauthorizedException('Current PIN is incorrect');
    }

    const isSamePin = await bcrypt.compare(params.newPin, user.pin);
    if (isSamePin) {
      throw new BadRequestException(
        'New PIN must be different from your current PIN',
      );
    }

    const hashedPin = await bcrypt.hash(params.newPin, 12);

    await this.userRepository.update({ id: userId }, { pin: hashedPin });

    this.logger.log(`PIN changed for user ${userId}`);

    return {
      success: true,
      message: 'PIN changed successfully',
    };
  }

  async loginWithPin(params: LoginPinDto) {
    this.logger.log(`PIN Login attempt for ${params.emailOrPhone}`);
    const user = await this.userRepository.findOne({
      where: [
        { email: params.emailOrPhone },
        { phoneNumber: params.emailOrPhone },
      ],
      select: [
        'id',
        'pin',
        'firstName',
        'lastName',
        'email',
        'phoneNumber',
        'accountType',
        'hasVerifiedPhone',
      ],
    });

    if (!user || !user.pin)
      throw new BadRequestException('Invalid credentials');

    const isPinValid = await bcrypt.compare(params.pin, user.pin);
    if (!isPinValid) throw new BadRequestException('Invalid credentials');

    // PIN login also requires phone verification if not already verified
    if (!user.hasVerifiedPhone) {
      const phoneOtp = generateNumericToken(6);
      const otpExpiration = new Date(Date.now() + 5 * 60 * 1000);
      user.phoneOtp = phoneOtp;
      user.otpExpiration = otpExpiration;
      await this.userRepository.save(user);

      await this.smsService.sendSMS(
        user.phoneNumber,
        `Your OTP is ${phoneOtp}`,
      );

      return {
        data: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phoneNumber: user.phoneNumber,
          accountType: user.accountType,
          hasVerifiedPhone: user.hasVerifiedPhone,
        },
        accessToken: null,
        refreshToken: null,
      };
    }

    const tokens = await this.generateTokens(user.id);
    await this.updateRefreshToken(user.id, tokens.refreshToken);
    return {
      data: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        accountType: user.accountType,
        hasVerifiedPhone: user.hasVerifiedPhone,
      },
      ...tokens,
    };
  }

  async updateSettings(id, data) {
    await this.settingsService.update(id, data);
  }

  async enable2FA(userId: string) {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
        relations: ['settings'],
      });

      console.log('user', user);

      if (!user) {
        throw new NotFoundException('User not found not found');
      }

      if (!user.settings) {
        throw new InternalServerErrorException('Failed to load user settings');
      }

      const { secret, qrCode } = await this.otpAuthService.enable2FA(
        user,
        user.settings.id,
        user.email,
        async (id, data) => {
          await this.updateSettings(id, data);
        },
      );

      return { secret, qrCode };
    } catch (error) {
      throw error;
    }
  }

  async verify2FA(userId: string, token: string) {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
        relations: ['settings'],
      });

      if (!user) {
        throw new NotFoundException('User not found not found');
      }

      const verified = await this.otpAuthService.verify2FA(
        user,
        user.settings.id,
        token,
        (user) => user.settings.twoFactorSecret,
        async (id, data) => {
          await this.updateSettings(id, data);
        },
      );

      if (!verified) {
        throw new InternalServerErrorException('Token verification failed');
      }

      return {
        status: 'success',
        statusCode: HttpStatus.OK,
        message: `Two factor verified for user successfully`,
        data: verified,
        error: null,
      };
    } catch (error) {
      console.log('Error', error);
      throw error;
    }
  }

  async validate2FALogin(userId: string, token: string) {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
        relations: ['settings'],
      });

      if (!user) {
        throw new NotFoundException('User not found not found');
      }

      const { twoFactorSecret, twoFactorEnabled } = user.settings;

      const result = await this.otpAuthService.validate2FALogin(
        token,
        twoFactorSecret,
        twoFactorEnabled,
      );

      if (!result) {
        throw new InternalServerErrorException(
          `Error in validating user two factor authentication`,
        );
      }

      const tokens = await this.generateTokens(user.id);
      await this.updateRefreshToken(user.id, tokens.refreshToken);

      return {
        status: 'success',
        statusCode: HttpStatus.OK,
        message: `Two factor authentication validated for user successfully`,
        data: tokens,
        error: null,
      };
    } catch (error) {
      console.log('Error', error);
      throw error;
    }
  }

  async disable2FA(userId: string, token: string) {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
        relations: ['settings'],
      });

      if (!user) {
        throw new NotFoundException('User not found not found');
      }

      const result = await this.otpAuthService.disable2FA(
        user,
        user.settings.id,
        token,
        (user) => user.settings.twoFactorSecret,
        (user) => user.settings.twoFactorEnabled,
        async (id, data) => {
          await this.updateSettings(id, data);
        },
      );

      if (!result) {
        throw new InternalServerErrorException('Token verification failed');
      }

      return {
        status: 'success',
        statusCode: HttpStatus.OK,
        message: `Two factor disabled for user successfully`,
        data: result,
        error: null,
      };
    } catch (error) {
      throw error;
    }
  }
}
