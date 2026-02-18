import { AbstractRepository } from '../../../common/entities';
import { Transaction } from '../entities';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

export class TransactionRepository extends AbstractRepository<Transaction> {
  constructor(@InjectRepository(Transaction) repo: Repository<Transaction>) {
    super(repo);
  }
}
