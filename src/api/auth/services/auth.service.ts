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
} from '../auth.dto';
import { UserRepository } from '../../user/user.repository';
import { generateNumericToken } from '../../../common/helpers/token-generator';
import { TermiiService } from '../../../common/services/termii.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    private readonly userRepository: UserRepository,
    private readonly jwtService: JwtService,
    private readonly smsService: TermiiService,
  ) {}

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

      await this.userRepository.create(
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
      
      await this.smsService.sendSMS(phoneNumber, `Your OTP is ${phoneOtp}`);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Unable to signup user', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async login(params: LoginDto) {
    const user = await this.userRepository.findOne({
      where: [
        { email: params.emailOrPhone },
        { phoneNumber: params.emailOrPhone },
      ],
    });
    if (!user) throw new NotFoundException('Account not found');
    if (!user.hasVerifiedPhone) {
      const phoneOtp = generateNumericToken(4);
      const otpExpiration = new Date(Date.now() + 5 * 60 * 1000);
      user.phoneOtp = phoneOtp;
      user.otpExpiration = otpExpiration;
      await this.userRepository.save(user);
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
        access_token: null,
      };
    }
    const isPasswordValid = await bcrypt.compare(
      params.password,
      user.password,
    );
    if (!isPasswordValid) throw new BadRequestException('Invalid credentials');
    const payload = { sub: user.uuid };
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
      access_token: this.jwtService.sign(payload),
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
      const payload = { sub: user.uuid };
      return {
        access_token: this.jwtService.sign(payload),
      };
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
}
