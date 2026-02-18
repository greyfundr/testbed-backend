import { AbstractRepository } from '../../../common/entities';
import { WithdrawalRequest } from '../entities/';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

export class WithdrawalRequestRepository extends AbstractRepository<WithdrawalRequest> {
  constructor(
    @InjectRepository(WithdrawalRequest) repo: Repository<WithdrawalRequest>,
  ) {
    super(repo);
  }
}
