import { AbstractRepository } from '../../../common/entities';
import { VirtualAccount } from '../entities/';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

export class VirtualAccountRepository extends AbstractRepository<VirtualAccount> {
  constructor(
    @InjectRepository(VirtualAccount) repo: Repository<VirtualAccount>,
  ) {
    super(repo);
  }
}
