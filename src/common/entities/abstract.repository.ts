import {
  Repository,
  DeepPartial,
  FindOneOptions,
  FindManyOptions,
  EntityManager,
} from 'typeorm';
import { AbstractEntity } from './index';

export abstract class AbstractRepository<T extends AbstractEntity> {
  protected constructor(protected readonly repository: Repository<T>) {}

  private getManager(em?: EntityManager): EntityManager {
    return em || this.repository.manager;
  }

  async create(data: DeepPartial<T>, em?: EntityManager): Promise<T> {
    const entity = this.repository.create(data);
    return await this.getManager(em).save(entity);
  }

  async save(entity: T, em?: EntityManager): Promise<T> {
    return await this.getManager(em).save(entity);
  }

  async findOne(
    options: FindOneOptions<T>,
    em?: EntityManager,
  ): Promise<T | null> {
    if (em) {
      return await em.findOne(this.repository.target, options);
    }
    return await this.repository.findOne(options);
  }

  async findOneById(id: any, em?: EntityManager): Promise<T | null> {
    const options: FindOneOptions<T> = {
      where: { id } as any,
    };
    if (em) {
      return await em.findOne(this.repository.target, options);
    }
    return await this.repository.findOne(options);
  }

  async findAll(
    options?: FindManyOptions<T>,
    em?: EntityManager,
  ): Promise<T[]> {
    if (em) {
      return await em.find(this.repository.target, options);
    }
    return await this.repository.find(options);
  }

  async update(id: any, data: DeepPartial<T>, em?: EntityManager): Promise<T> {
    await this.getManager(em).update(this.repository.target, id, data as any);
    const updatedEntity = await this.findOneById(id, em);
    if (!updatedEntity) {
      throw new Error('Entity not found after update');
    }
    return updatedEntity;
  }

  async remove(id: any, em?: EntityManager): Promise<void> {
    await this.getManager(em).delete(this.repository.target, id);
  }

  createQueryBuilder(alias?: string, em?: EntityManager) {
    if (em) {
      return em.createQueryBuilder(this.repository.target, <string>alias);
    }
    return this.repository.createQueryBuilder(alias);
  }
}
