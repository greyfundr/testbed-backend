import { Admin } from '../entities/admin.entity';
import { AbstractRepository } from '../../../common/entities';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AdminRepository extends AbstractRepository<Admin> {
  constructor(@InjectRepository(Admin) repo: Repository<Admin>) {
    super(repo);
  }
}
