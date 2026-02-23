import { AbstractRepository } from '../../../common/entities';
import { Kyc } from '../entities/kyc.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

export class KycRepository extends AbstractRepository<Kyc> {
  constructor(@InjectRepository(Kyc) repo: Repository<Kyc>) {
    super(repo);
  }
}
