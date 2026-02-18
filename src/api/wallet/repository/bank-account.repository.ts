import { AbstractRepository } from '../../../common/entities';
import { BankAccount } from '../entities/';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

export class BankAccountRepository extends AbstractRepository<BankAccount> {
  constructor(@InjectRepository(BankAccount) repo: Repository<BankAccount>) {
    super(repo);
  }
}
