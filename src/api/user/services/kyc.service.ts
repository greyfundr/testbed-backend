import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import {
  KycRepository,
  ProfileRepository,
  UserRepository,
} from '../repository';
import { SubmitBvnDto, SubmitKycDto } from '../dtos';
import { User, Kyc } from '../entities';
import { KycLevels, KycStatus, KycVerificationType } from '../enums/user.enum';
import { UserKycService } from 'src/common/services/kyc-verification.service';
import * as crypto from 'crypto';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';

interface DiditIdVerification {
  status: string;
  first_name: string;
  last_name: string;
  document_number: string;
  document_type: string;
  issuing_state: string;
  issuing_state_name: string;
  date_of_birth: string;
  full_name: string;
  node_id: string;
}

interface DiditDecision {
  id_verifications: DiditIdVerification[];
  status?: string;
  features?: string[];
  session_id?: string;
}

interface DiditWebhookPayload {
  webhook_type: string;
  vendor_data: string;
  session_id: string;
  status: string;
  decision?: DiditDecision;
  timestamp?: number;
  workflow_id?: string;
}

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    private readonly kycRepository: KycRepository,
    private readonly userRepository: UserRepository,
    private readonly profileRepository: ProfileRepository,
    private readonly userKycService: UserKycService,
    private readonly config: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly dataSource: DataSource,
  ) {}

  private async getKycByLevel(
    userId: string,
    level: KycLevels,
    qrManager?: any,
  ): Promise<Kyc | null> {
    const repo = qrManager ? qrManager.getRepository(Kyc) : this.kycRepository;
    return repo.findOne({ where: { user: { id: userId }, name: level } });
  }

  async submitKyc(user: User, submitKycDto: SubmitKycDto) {
    let kyc = await this.getKycByLevel(user.id, KycLevels.LEVEL_2);

    if (kyc && kyc.status === KycStatus.VERIFIED) {
      throw new ConflictException('KYC Tier 2 already verified');
    }

    if (!kyc) {
      kyc = await this.kycRepository.create({
        user: { id: user.id },
        name: KycLevels.LEVEL_2,
        attemptCount: 0,
      });
    }

    kyc.verificationType = submitKycDto.verificationType;
    kyc.idNumber = submitKycDto.idNumber;
    kyc.documentImage = submitKycDto.documentImage || null;
    kyc.status = KycStatus.PENDING;
    kyc.rejectionReason = null;
    kyc.attemptCount = (kyc.attemptCount || 0) + 1;

    await this.kycRepository.save(kyc);

    if (user.hasCompletedKyc) {
      user.hasCompletedKyc = false;
      await this.userRepository.save(user);
    }

    return kyc;
  }

  async getKycStatus(userId: string) {
    const kycs = await this.kycRepository.findAll({
      where: { user: { id: userId } },
      order: { name: 'ASC' },
    });

    const level1 = kycs.find((k) => k.name === KycLevels.LEVEL_1) ?? null;
    const level2 = kycs.find((k) => k.name === KycLevels.LEVEL_2) ?? null;

    return {
      level1: level1
        ? {
            status: level1.status,
            verificationType: level1.verificationType,
            verifiedAt: level1.verifiedAt,
            rejectedAt: level1.rejectedAt,
            rejectionReason: level1.rejectionReason,
          }
        : { status: 'not_submitted' },

      level2: level2
        ? {
            status: level2.status,
            verificationType: level2.verificationType,
            verifiedAt: level2.verifiedAt,
            rejectedAt: level2.rejectedAt,
            rejectionReason: level2.rejectionReason,
            attemptCount: level2.attemptCount,
            canRetry:
              level2.status === KycStatus.REJECTED &&
              (level2.attemptCount || 0) < 3,
          }
        : { status: 'not_submitted' },

      isLevel1Verified: level1?.status === KycStatus.VERIFIED,
      isLevel2Verified: level2?.status === KycStatus.VERIFIED,
      hasCompletedKyc:
        level1?.status === KycStatus.VERIFIED &&
        level2?.status === KycStatus.VERIFIED,
    };
  }

  async submitBvn(user: User, dto: SubmitBvnDto) {
    const level1 = await this.getKycByLevel(user.id, KycLevels.LEVEL_1);

    if (level1?.status === KycStatus.VERIFIED) {
      throw new ConflictException(
        'Your BVN has already been verified (Level 1 complete).',
      );
    }

    await this.userRepository.update(user.id, { bvn: dto.bvn });

    if (level1) {
      await this.kycRepository.update(level1.id, {
        verificationType: KycVerificationType.BVN,
        idNumber: dto.bvn,
        status: KycStatus.VERIFIED,
        rejectionReason: null,
        verifiedAt: new Date(),
        attemptCount: (level1.attemptCount || 0) + 1,
      });
    } else {
      await this.kycRepository.save(
        await this.kycRepository.create({
          user: { id: user.id },
          name: KycLevels.LEVEL_1,
          verificationType: KycVerificationType.BVN,
          idNumber: dto.bvn,
          status: KycStatus.VERIFIED,
          rejectionReason: null,
          verifiedAt: new Date(),
          attemptCount: 1,
        }),
      );
    }

    this.logger.log(`[KYC] User ${user.id} Level 1 (BVN) verified.`);

    return {
      message: 'BVN verified. You have completed Level 1 KYC.',
      level: KycLevels.LEVEL_1,
      status: KycStatus.VERIFIED,
    };
  }

  async createKycSession(userId: string) {
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const user = await queryRunner.manager.findOne(User, {
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      if (!user.dateOfBirth) {
        throw new BadRequestException(
          'Please fill in your date of birth in account information to proceed with KYC',
        );
      }

      const existingLevel1 = await queryRunner.manager.findOne(Kyc, {
        where: {
          user: { id: userId },
          name: KycLevels.LEVEL_1,
          status: KycStatus.VERIFIED,
        },
      });

      if (!existingLevel1) {
        throw new BadRequestException(
          'You have not completed Level 1 KYC verification. Please submit your BVN to proceed.',
        );
      }

      const diditSession = await this.userKycService.createDiditSession({
        id: user.id,
      });

      if (!diditSession) {
        throw new BadRequestException('Failed to create Didit session');
      }

      await queryRunner.commitTransaction();

      return {
        status: 'success',
        statusCode: 200,
        message: 'Didit session created successfully',
        data: { ...diditSession },
        error: null,
      };
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  mapDocTypeToVerificationType(
    docType: string,
    issuingState: string,
  ): KycVerificationType {
    const type = docType?.toLowerCase().trim();
    const state = issuingState?.toLowerCase().trim();

    if (type === 'passport') return KycVerificationType.PASSPORT;
    if (type === 'driving license' || type === 'id_card')
      return KycVerificationType.DRIVERS_LICENSE;
    if ((type === 'identity card' || type === 'id_card') && state === 'nga')
      return KycVerificationType.NIN;
    if (type === 'identity card') return KycVerificationType.NATIONAL_ID;

    return KycVerificationType.NATIONAL_ID;
  }

  normaliseDob(raw: string): string {
    if (!raw) return '';
    if (raw.includes('/')) {
      const [d, m, y] = raw.split('/');
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    return raw.substring(0, 10);
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const secret = this.config.get<string>('DIDIT_WEBHOOK_SECRET');
    if (!secret) return false;

    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('hex');
    const incoming = signature.startsWith('sha256=')
      ? signature.slice(7)
      : signature;

    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(incoming, 'hex'),
    );
  }

  async handleKycVerificationWebhook(
    payload: DiditWebhookPayload,
    rawBody: string,
    signature: string,
  ): Promise<void> {
    if (!this.verifyWebhookSignature(rawBody, signature)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const { webhook_type, vendor_data: userId, decision, status } = payload;

    this.logger.log(
      `[KYC Webhook] type=${webhook_type} userId=${userId} status=${status}`,
    );

    if (webhook_type !== 'status.updated' || !userId || !status) {
      this.logger.log(
        '[KYC Webhook] Skipping — not a status.updated event or missing data',
      );
      return;
    }

    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    const idVerification = decision?.id_verifications?.[0] ?? null;

    switch (status) {
      case 'Approved':
        await this.handleApproved(user, idVerification);
        break;
      case 'Declined':
        await this.handleDeclined(user.id);
        break;
      case 'In Review':
        await this.handleInReview(user.id, idVerification);
        break;
      default:
        this.logger.warn(`[KYC Webhook] Unknown status: ${status}`);
    }
  }

  private async handleApproved(
    user: User,
    idVerification: DiditIdVerification | null,
  ): Promise<void> {
    if (!idVerification) {
      this.logger.warn(
        `[KYC Webhook] Approved but no id_verifications for user ${user.id}`,
      );
      return;
    }

    const {
      first_name,
      last_name,
      full_name,
      document_number,
      document_type,
      issuing_state,
      date_of_birth,
    } = idVerification;

    const docFullName = (full_name ?? `${first_name} ${last_name}`)
      .toUpperCase()
      .trim();
    const userFirstName = (user.firstName ?? '').toUpperCase().trim();
    const userLastName = (user.lastName ?? '').toUpperCase().trim();

    if (
      !docFullName.includes(userFirstName) ||
      !docFullName.includes(userLastName)
    ) {
      await this.updateLevel2Status(user.id, KycStatus.REJECTED, {
        rejectionReason:
          'Name on document does not match your registered name.',
        rejectedAt: new Date(),
      });
      this.eventEmitter.emit('kyc.name_mismatch', { userId: user.id });
      return;
    }

    if (user.dateOfBirth) {
      const docDob = this.normaliseDob(date_of_birth);
      const userDob = this.normaliseDob(String(user.dateOfBirth));

      if (docDob !== userDob) {
        await this.updateLevel2Status(user.id, KycStatus.REJECTED, {
          rejectionReason:
            'Date of birth on document does not match your profile.',
          rejectedAt: new Date(),
        });
        this.eventEmitter.emit('kyc.dob_mismatch', { userId: user.id });
        return;
      }
    }

    const verificationType = this.mapDocTypeToVerificationType(
      document_type,
      issuing_state,
    );

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const existingLevel2 = await qr.manager.findOne(Kyc, {
        where: { user: { id: user.id }, name: KycLevels.LEVEL_2 },
      });

      if (existingLevel2) {
        await qr.manager.update(Kyc, existingLevel2.id, {
          status: KycStatus.VERIFIED,
          verificationType,
          idNumber: document_number,
          rejectionReason: null,
          verifiedAt: new Date(),
          rejectedAt: null,
          attemptCount: (existingLevel2.attemptCount || 0) + 1,
        });
      } else {
        await qr.manager.save(
          qr.manager.create(Kyc, {
            user: { id: user.id },
            name: KycLevels.LEVEL_2,
            status: KycStatus.VERIFIED,
            verificationType,
            idNumber: document_number,
            rejectionReason: null,
            verifiedAt: new Date(),
            attemptCount: 1,
          }),
        );
      }

      await qr.manager.update(User, user.id, { hasCompletedKyc: true });
      await qr.commitTransaction();

      this.eventEmitter.emit('kyc.approved', {
        userId: user.id,
        email: user.email,
        docType: verificationType,
      });
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  private async handleDeclined(userId: string): Promise<void> {
    await this.updateLevel2Status(userId, KycStatus.REJECTED, {
      rejectionReason:
        'Your identity verification was declined. Please contact support.',
      rejectedAt: new Date(),
    });

    this.logger.log(`[KYC Webhook] ❌ Level 2 Declined for user ${userId}`);
    this.eventEmitter.emit('kyc.declined', { userId });
  }

  private async handleInReview(
    userId: string,
    idVerification: DiditIdVerification | null,
  ): Promise<void> {
    const verificationType = idVerification
      ? this.mapDocTypeToVerificationType(
          idVerification.document_type,
          idVerification.issuing_state,
        )
      : KycVerificationType.NIN;

    const idNumber = idVerification?.document_number ?? '';

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const existingLevel2 = await qr.manager.findOne(Kyc, {
        where: { user: { id: userId }, name: KycLevels.LEVEL_2 },
      });

      if (existingLevel2) {
        await qr.manager.update(Kyc, existingLevel2.id, {
          status: KycStatus.PENDING,
          verificationType,
          idNumber,
        });
      } else {
        await qr.manager.save(
          qr.manager.create(Kyc, {
            user: { id: userId },
            name: KycLevels.LEVEL_2,
            status: KycStatus.PENDING,
            verificationType,
            idNumber,
            rejectionReason: null,
            attemptCount: 1,
          }),
        );
      }

      await qr.commitTransaction();
      this.logger.log(`[KYC Webhook] 🕐 Level 2 In Review for user ${userId}`);
      this.eventEmitter.emit('kyc.in_review', { userId });
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  private async updateLevel2Status(
    userId: string,
    status: KycStatus,
    extra: Partial<
      Pick<
        Kyc,
        | 'rejectionReason'
        | 'verifiedAt'
        | 'rejectedAt'
        | 'verificationType'
        | 'idNumber'
      >
    >,
  ): Promise<void> {
    const existing = await this.getKycByLevel(userId, KycLevels.LEVEL_2);

    if (existing) {
      await this.kycRepository.update(existing.id, {
        status,
        attemptCount: (existing.attemptCount || 0) + 1,
        ...extra,
      });
    } else {
      await this.kycRepository.save(
        await this.kycRepository.create({
          user: { id: userId },
          name: KycLevels.LEVEL_2,
          status,
          verificationType: extra.verificationType ?? KycVerificationType.NIN,
          idNumber: extra.idNumber ?? '',
          attemptCount: 1,
          ...extra,
        }),
      );
    }
  }
}
