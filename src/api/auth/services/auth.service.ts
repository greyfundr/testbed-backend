import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  CompleteKycDto,
  CreatePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  SignupDto,
  SubmitBasicInfoDto,
  VerifyOtpDto,
  LoginPinDto,
  SetPinDto,
} from '../auth.dto';
import { UserRepository } from '../../user/repository';
import { generateNumericToken } from '../../../common/helpers/token-generator';
import { TermiiService } from '../../../common/services/termii.service';
import * as bcrypt from 'bcrypt';
import { SettingsService } from '../../settings/services';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    private readonly userRepository: UserRepository,
    private readonly jwtService: JwtService,
    private readonly smsService: TermiiService,
    private readonly settingsService: SettingsService,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  async signup(params: SignupDto) {
    const queryRunner = this.userRepository
      .getManager()
      .connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const { email, phoneNumber, password, accountType } = params;

      const existingUser = await this.userRepository.findOne({
        where: { email },
      });

      if (existingUser) {
        throw new ConflictException('Email already exists');
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const phoneOtp = generateNumericToken(6);
      const otpExpiration = new Date(Date.now() + 5 * 60 * 1000);

      const user = await this.userRepository.create(
        {
          email,
          password: hashedPassword,
          accountType,
          phoneOtp,
          phoneNumber,
          otpExpiration,
        },
        queryRunner.manager,
      );

      await this.settingsService.createDefaultSettings(user.uuid);

      await this.smsService.sendSMS(phoneNumber, `Your OTP is ${phoneOtp}`);

      this.eventEmitter.emit('user.created', {
        userUuid: user.uuid,
        email: user.email,
        phoneNumber: user.phoneNumber,
      });
    } catch (error) {
      await queryRunner.rollbackTransaction();
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
        'uuid',
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
      const phoneOtp = generateNumericToken(4);
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
          uuid: user.uuid,
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

    const tokens = await this.generateTokens(user.uuid);
    await this.updateRefreshToken(user.uuid, tokens.refreshToken);
    return {
      data: {
        uuid: user.uuid,
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
      const tokens = await this.generateTokens(user.uuid);
      await this.updateRefreshToken(user.uuid, tokens.refreshToken);
      return tokens;
    } catch (error) {
      this.logger.error('Unable to verify OTP', error);
      throw error;
    }
  }

  async resendOtpForPasswordChange(params: ForgotPasswordDto) {
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
      const phoneOtp = generateNumericToken(4);
      const otpExpiration = new Date(Date.now() + 5 * 60 * 1000);

      user.phoneOtp = phoneOtp;
      user.otpExpiration = otpExpiration;
      await this.userRepository.save(user);
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
      const otp = generateNumericToken(4);
      const otpExpiration = new Date(Date.now() + 5 * 60 * 1000);

      user.phoneOtp = otp;
      user.emailOtp = otp;
      user.otpExpiration = otpExpiration;
      await this.userRepository.save(user);

      //TODO: Add proper sms message for OTP
      await this.smsService.sendSMS(params.emailOrPhone, `Your OTP is ${otp}`);
    } catch (error) {
      this.logger.error('Unable to send OTP', error);
      throw error;
    }
  }

  async createNewPassword(params: CreatePasswordDto, userUuid: string) {
    try {
      const existingUser = await this.userRepository.findOne({
        where: {
          uuid: userUuid,
        },
      });
      if (!existingUser) throw new NotFoundException('Account not found');
      const hashedPassword = await bcrypt.hash(existingUser.password, 10);
      existingUser.password = hashedPassword;
      await this.userRepository.save(existingUser);
    } catch (error) {
      this.logger.error('Unable to create new password', error);
      throw error;
    }
  }

  async submitBasicInfo(params: SubmitBasicInfoDto, userUuid: string) {
    const user = await this.userRepository.findOne({
      where: { uuid: userUuid },
    });
    if (!user) throw new NotFoundException('Account not found');
    user.firstName = params.firstName;
    user.lastName = params.lastName;
    user.hasSubmittedBasicInfo = true;
    await this.userRepository.save(user);
  }

  async completeKyc(params: CompleteKycDto, userUuid: string) {
    const user = await this.userRepository.findOne({
      where: { uuid: userUuid },
    });
    if (!user) throw new NotFoundException('Account not found');
    user.firstName = params.companyName;
    user.lastName = '';
    user.hasCompletedKyc = true;
    await this.userRepository.save(user);
  }

  async refreshTokens(refreshToken: string) {
    let payload;
    try {
      payload = await this.jwtService.verifyAsync(refreshToken);
    } catch (e) {
      throw new ForbiddenException('Access Denied');
    }

    const userUuid = payload.sub;
    const user = await this.userRepository.findOne({
      where: { uuid: userUuid },
    });
    if (!user || !user.refreshToken)
      throw new ForbiddenException('Access Denied');

    const refreshTokenMatches = await bcrypt.compare(
      refreshToken,
      user.refreshToken,
    );
    if (!refreshTokenMatches) throw new ForbiddenException('Access Denied');

    const tokens = await this.generateTokens(user.uuid);
    await this.updateRefreshToken(user.uuid, tokens.refreshToken);
    return tokens;
  }

  async updateRefreshToken(userUuid: string, refreshToken: string) {
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    await this.userRepository.update(
      { uuid: userUuid },
      { refreshToken: hashedRefreshToken },
    );
  }

  async generateTokens(userUuid: string) {
    const payload = { sub: userUuid };
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

  async setPin(userUuid: string, pin: string) {
    const hashedPin = await bcrypt.hash(pin, 10);
    await this.userRepository.update({ uuid: userUuid }, { pin: hashedPin });
  }

  async loginWithPin(params: LoginPinDto) {
    this.logger.log(`PIN Login attempt for ${params.emailOrPhone}`);
    const user = await this.userRepository.findOne({
      where: [
        { email: params.emailOrPhone },
        { phoneNumber: params.emailOrPhone },
      ],
      select: [
        'uuid',
        'pin',
        'firstName',
        'lastName',
        'email',
        'phoneNumber',
        'accountType',
        'hasVerifiedPhone',
      ],
    });

    if (!user || !user.pin) throw new BadRequestException('Invalid credentials');

    const isPinValid = await bcrypt.compare(params.pin, user.pin);
    if (!isPinValid) throw new BadRequestException('Invalid credentials');

    // PIN login also requires phone verification if not already verified
    if (!user.hasVerifiedPhone) {
      const phoneOtp = generateNumericToken(4);
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
          uuid: user.uuid,
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

    const tokens = await this.generateTokens(user.uuid);
    await this.updateRefreshToken(user.uuid, tokens.refreshToken);
    return {
      data: {
        uuid: user.uuid,
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
}
