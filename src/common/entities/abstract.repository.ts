import {
  Repository,
  DeepPartial,
  FindOneOptions,
  FindManyOptions,
  FindOptionsWhere,
  EntityManager,
} from 'typeorm';
import { AbstractEntity } from './index';

export abstract class AbstractRepository<T extends AbstractEntity> {
  protected constructor(protected readonly repository: Repository<T>) {}

  getManager(em?: EntityManager): EntityManager {
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

  async findOneById(
    id: string | number,
    em?: EntityManager,
  ): Promise<T | null> {
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

  async findAndCount(
    options?: FindManyOptions<T>,
    em?: EntityManager,
  ): Promise<[T[], number]> {
    if (em) {
      return await em.findAndCount(this.repository.target, options);
    }
    return await this.repository.findAndCount(options);
  }

  async update(
    criteria: number | string | FindOptionsWhere<T>,
    data: DeepPartial<T>,
    em?: EntityManager,
  ): Promise<T> {
    await this.getManager(em).update(
      this.repository.target,
      criteria as any,
      data as any,
    );

    let updatedEntity: T | null = null;

    if (typeof criteria === 'number' || typeof criteria === 'string') {
      updatedEntity = await this.findOneById(criteria, em);
    } else {
      updatedEntity = await this.findOne({ where: criteria }, em);
    }

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
