import { DynamicLink, DynamicLinkProject } from '../entities';
import { AbstractRepository } from '../../../common/entities';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

export class DynamicLinkRepository extends AbstractRepository<DynamicLink> {
  constructor(@InjectRepository(DynamicLink) repo: Repository<DynamicLink>) {
    super(repo);
  }
}

export class DynamicLinkProjectRepository extends AbstractRepository<DynamicLinkProject> {
  constructor(
    @InjectRepository(DynamicLinkProject) repo: Repository<DynamicLinkProject>,
  ) {
    super(repo);
  }
}
