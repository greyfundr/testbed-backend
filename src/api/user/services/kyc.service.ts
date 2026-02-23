import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { KycRepository, UserRepository } from '../repository';
import { SubmitKycDto } from '../dtos';
import { User, Kyc } from '../entities';
import { KycStatus } from '../enums/user.enum';

@Injectable()
export class KycService {
  constructor(
    private readonly kycRepository: KycRepository,
    private readonly userRepository: UserRepository,
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
}
