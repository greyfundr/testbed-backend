import { AbstractRepository } from '../../../common/entities';
import { Profile } from '../entities/profile.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

export class ProfileRepository extends AbstractRepository<Profile> {
  constructor(@InjectRepository(Profile) repo: Repository<Profile>) {
    super(repo);
  }
}
