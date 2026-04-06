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
  issuing_state_name: string;
  date_of_birth: string; // "YYYY-MM-DD" or "DD/MM/YYYY"
}

interface DiditDecision {
  status: 'Approved' | 'Declined' | 'In Review';
  id_verification?: DiditIdVerification;
}

interface DiditWebhookPayload {
  webhook_type: string;
  vendor_data: string; // userId
  session_id: string;
  decision?: DiditDecision;
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

  async submitKyc(user: User, submitKycDto: SubmitKycDto) {
    // Check if user already has a verified KYC
    let kyc = await this.kycRepository.findOne({
      where: { user: { id: user.id } },
    });

    if (kyc && kyc.status === KycStatus.VERIFIED) {
      throw new ConflictException('KYC already verified');
    }

    if (!kyc) {
      kyc = new Kyc();
      kyc.user = user;
    }

    kyc.verificationType = submitKycDto.verificationType;
    kyc.idNumber = submitKycDto.idNumber;
    kyc.documentImage = submitKycDto.documentImage || null;
    kyc.status = KycStatus.PENDING;
    kyc.rejectionReason = null;

    await this.kycRepository.save(kyc);

    // Reset user completion flag if it was somehow set
    if (user.hasCompletedKyc) {
      user.hasCompletedKyc = false;
      await this.userRepository.save(user);
    }

    return kyc;
  }

  async getKycStatus(user: User) {
    const kyc = await this.kycRepository.findOne({
      where: { user: { id: user.id } },
    });

    if (!kyc) {
      return { status: 'not_submitted' };
    }

    return kyc;
  }

  async submitBvn(user: User, dto: SubmitBvnDto) {
    let kyc = await this.kycRepository.findOne({
      where: { user: { id: user.id } },
    });

    if (kyc && kyc.status === KycStatus.VERIFIED) {
      if (kyc.name === KycLevels.LEVEL_2) {
        throw new ConflictException(
          'You have already completed Tier 2 KYC verification.',
        );
      }
      if (
        user.bvn ||
        (kyc.name === KycLevels.LEVEL_1 &&
          kyc.verificationType === KycVerificationType.BVN)
      ) {
        throw new ConflictException('Your BVN has already been submitted.');
      }
    }

    user.bvn = dto.bvn;
    await this.userRepository.save(user);

    if (!kyc) {
      kyc = new Kyc();
      kyc.user = user;
    }

    kyc.name = KycLevels.LEVEL_1;
    kyc.verificationType = KycVerificationType.BVN;
    kyc.idNumber = dto.bvn;
    kyc.status = KycStatus.VERIFIED;
    kyc.rejectionReason = null;

    await this.kycRepository.save(kyc);

    this.logger.log(
      `[KYC] User ${user.id} upgraded to LEVEL_1. BVN securely saved.`,
    );

    return {
      status: 'success',
      message: 'BVN saved successfully. You are now at KYC Level 1.',
      data: kyc,
    };
  }

  async createKycSession(userId: string) {
    const queryRunner = this.kycRepository
      .getManager()
      .connection.createQueryRunner();

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

      const existingKyc = await queryRunner.manager.findOne(Kyc, {
        where: {
          user: { id: userId },
          verificationType: KycVerificationType.BVN,
          status: KycStatus.VERIFIED,
        },
      });

      if (!existingKyc) {
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
      await queryRunner.rollbackTransaction();
    } finally {
      await queryRunner.release();
    }
  }

  mapDocTypeToVerificationType(
    docType: string,
    issuingState: string,
  ): KycVerificationType {
    const type = docType?.toLowerCase();
    const state = issuingState?.toLowerCase();

    if (type === 'passport') return KycVerificationType.PASSPORT;
    if (type === 'id_card' && state === 'ng') return KycVerificationType.NIN;
    if (type === 'id_card') return KycVerificationType.NIN;
    return KycVerificationType.DRIVERS_LICENSE;
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
    if (!secret) {
      this.logger.error('[KYC Webhook] DIDIT_WEBHOOK_SECRET is not configured');
      return false;
    }

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
      this.logger.warn('[KYC Webhook] Invalid signature — rejecting');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const { webhook_type, vendor_data: userId, decision, session_id } = payload;

    this.logger.log(
      `[KYC Webhook] Received: type=${webhook_type} userId=${userId} session=${session_id}`,
    );

    if (webhook_type !== 'status.updated') {
      this.logger.log(`[KYC Webhook] Ignoring event type: ${webhook_type}`);
      return;
    }

    if (!userId) {
      throw new BadRequestException('Missing vendor_data (userId) in payload');
    }

    if (!decision?.status) {
      this.logger.log('[KYC Webhook] No decision in payload — skipping');
      return;
    }

    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['kyc', 'profile'],
    });

    if (!user) {
      this.logger.error(`[KYC Webhook] User not found: ${userId}`);
      throw new NotFoundException(`User ${userId} not found`);
    }

    this.logger.log(
      `[KYC Webhook] Processing decision "${decision.status}" for user ${userId}`,
    );

    switch (decision.status) {
      case 'Approved':
        await this.handleApproved(user, decision);
        break;
      case 'Declined':
        await this.handleDeclined(user);
        break;
      case 'In Review':
        await this.handleInReview(user, decision);
        break;
      default:
        this.logger.warn(
          `[KYC Webhook] Unknown decision status: ${decision.status}`,
        );
    }
  }

  private async handleApproved(
    user: User,
    decision: DiditDecision,
  ): Promise<void> {
    const idVerification = decision.id_verification;

    if (!idVerification) {
      this.logger.warn(
        `[KYC Webhook] Approved but no id_verification for user ${user.id}`,
      );
      return;
    }

    const {
      first_name,
      last_name,
      document_number,
      document_type,
      issuing_state_name,
      date_of_birth,
    } = idVerification;

    const docFullName = `${first_name} ${last_name}`.toUpperCase().trim();
    const userFirstName = (user.firstName ?? '').toUpperCase().trim();
    const userLastName = (user.lastName ?? '').toUpperCase().trim();

    if (
      !docFullName.includes(userFirstName) ||
      !docFullName.includes(userLastName)
    ) {
      this.logger.warn(
        `[KYC Webhook] Name mismatch for user ${user.id}: ` +
          `doc="${docFullName}" user="${userFirstName} ${userLastName}"`,
      );

      await this.updateKycStatus(user, KycStatus.REJECTED, {
        rejectionReason:
          'Name on document does not match your registered name. ' +
          'Please contact support.',
      });

      this.eventEmitter.emit('kyc.name_mismatch', { userId: user.id });
      return;
    }

    if (user.dateOfBirth) {
      const docDob = this.normaliseDob(date_of_birth);
      const userDob = this.normaliseDob(
        user.dateOfBirth.toISOString().substring(0, 10),
      );

      if (docDob !== userDob) {
        this.logger.warn(
          `[KYC Webhook] DOB mismatch for user ${user.id}: ` +
            `doc="${docDob}" user="${userDob}"`,
        );

        await this.updateKycStatus(user, KycStatus.REJECTED, {
          rejectionReason:
            'Date of birth on document does not match your registered date of birth. ' +
            'Please update your profile and retry verification.',
        });

        this.eventEmitter.emit('kyc.dob_mismatch', { userId: user.id });
        return;
      }
    }

    const verificationType = this.mapDocTypeToVerificationType(
      document_type,
      issuing_state_name,
    );

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const existingKyc = user.kyc;

      if (existingKyc) {
        await qr.manager.update(Kyc, existingKyc.id, {
          status: KycStatus.VERIFIED,
          verificationType,
          idNumber: document_number,
          rejectionReason: null,
        });
      } else {
        const kyc = qr.manager.create(Kyc, {
          name: KycLevels.LEVEL_2,
          status: KycStatus.VERIFIED,
          verificationType,
          idNumber: document_number,
          documentImage: null,
          rejectionReason: null,
          user: { id: user.id },
        });
        await qr.manager.save(Kyc, kyc);
      }

      await qr.manager.update(User, user.id, { hasCompletedKyc: true });

      await qr.commitTransaction();

      this.logger.log(
        `[KYC Webhook] ✅ Approved and persisted for user ${user.id} ` +
          `(${verificationType} / ${document_type})`,
      );

      this.eventEmitter.emit('kyc.approved', {
        userId: user.id,
        email: user.email,
        docType: verificationType,
      });
    } catch (err) {
      await qr.rollbackTransaction();
      this.logger.error(
        `[KYC Webhook] DB error during approval for user ${user.id}`,
        err,
      );
      throw err;
    } finally {
      await qr.release();
    }
  }

  private async handleDeclined(user: User): Promise<void> {
    await this.updateKycStatus(user, KycStatus.REJECTED, {
      rejectionReason:
        'Your identity verification was declined. Please contact support.',
    });

    this.logger.log(`[KYC Webhook] ❌ Declined for user ${user.id}`);

    this.eventEmitter.emit('kyc.declined', {
      userId: user.id,
      email: user.email,
    });
  }

  private async handleInReview(
    user: User,
    decision: DiditDecision,
  ): Promise<void> {
    const idVerification = decision.id_verification;

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const existingKyc = user.kyc;

      if (existingKyc) {
        await qr.manager.update(Kyc, existingKyc.id, {
          status: KycStatus.PENDING,
          ...(idVerification && {
            verificationType: this.mapDocTypeToVerificationType(
              idVerification.document_type,
              idVerification.issuing_state_name,
            ),
            idNumber: idVerification.document_number,
          }),
        });
      } else if (idVerification) {
        const kyc = qr.manager.create(Kyc, {
          name: KycLevels.LEVEL_1,
          status: KycStatus.PENDING,
          verificationType: this.mapDocTypeToVerificationType(
            idVerification.document_type,
            idVerification.issuing_state_name,
          ),
          idNumber: idVerification.document_number,
          rejectionReason: null,
          user: { id: user.id },
        });
        await qr.manager.save(Kyc, kyc);
      }

      await qr.commitTransaction();

      this.logger.log(`[KYC Webhook] 🕐 In Review for user ${user.id}`);

      this.eventEmitter.emit('kyc.in_review', {
        userId: user.id,
        email: user.email,
      });
    } catch (err) {
      await qr.rollbackTransaction();
      this.logger.error(
        `[KYC Webhook] DB error during in_review for user ${user.id}`,
        err,
      );
      throw err;
    } finally {
      await qr.release();
    }
  }

  private async updateKycStatus(
    user: User,
    status: KycStatus,
    extra?: Partial<
      Pick<Kyc, 'rejectionReason' | 'verificationType' | 'idNumber'>
    >,
  ): Promise<void> {
    if (user.kyc) {
      await this.kycRepository.update(user.kyc.id, { status, ...extra });
    } else {
      const kyc = this.kycRepository.create({
        name: KycLevels.LEVEL_2,
        status,
        verificationType: extra?.verificationType ?? KycVerificationType.NIN,
        idNumber: extra?.idNumber ?? '',
        rejectionReason: extra?.rejectionReason ?? null,
        user: { id: user.id },
      });
      await this.kycRepository.save(await kyc);
    }
  }
}
