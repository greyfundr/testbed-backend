import { AbstractRepository } from '../../../common/entities';
import { LedgerEntry } from '../entities';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

export class LedgerEntryRepository extends AbstractRepository<LedgerEntry> {
  constructor(@InjectRepository(LedgerEntry) repo: Repository<LedgerEntry>) {
    super(repo);
  }
}
