import { AbstractRepository } from '../../../common/entities';
import { User } from '../entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

export class UserRepository extends AbstractRepository<User> {
  constructor(@InjectRepository(User) repo: Repository<User>) {
    super(repo);
  }
}
