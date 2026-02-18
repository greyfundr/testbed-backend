import { AbstractRepository } from '../../../common/entities';
import { Wallet } from '../entities/';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

export class WalletRepository extends AbstractRepository<Wallet> {
  constructor(@InjectRepository(Wallet) repo: Repository<Wallet>) {
    super(repo);
  }
}
