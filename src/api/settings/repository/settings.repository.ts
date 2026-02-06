import { AbstractRepository } from '../../../common/entities';
import { Settings } from '../entities/settings.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

export class SettingsRepository extends AbstractRepository<Settings> {
    constructor(@InjectRepository(Settings) repo: Repository<Settings>) {
        super(repo);
    }
}
