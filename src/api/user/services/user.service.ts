import { Injectable } from '@nestjs/common';
import { UpdateUserDto, UpdateProfileDto } from '../dtos';
import { User, Profile } from '../entities';
import { UserRepository, ProfileRepository } from '../repository';
import { DataSource } from 'typeorm';

@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly profileRepository: ProfileRepository,
    private readonly dataSource: DataSource,
  ) {}

  async findOneById(id: string) {
    return this.userRepository.findOne({
      where: { id },
    });
  }

  async getUserProfile(userId: string) {
    return this.userRepository.findOne({
      where: { id: userId },
      relations: ['profile', 'kyc'],
    });
  }

  update(id: number, updateUserDto: UpdateUserDto) {
    return this.userRepository.update(id, updateUserDto);
  }

  remove(id: number) {
    return this.userRepository.remove(id);
  }

  async updateProfile(user: User, updateProfileDto: UpdateProfileDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Update User fields
      if (updateProfileDto.firstName)
        user.firstName = updateProfileDto.firstName;
      if (updateProfileDto.lastName) user.lastName = updateProfileDto.lastName;
      if (updateProfileDto.username) user.username = updateProfileDto.username;

      await queryRunner.manager.save(user);

      // Handle Profile fields
      let profile = await this.profileRepository.findOne({
        where: { user: { id: user.id } },
      });

      if (!profile) {
        profile = new Profile();
        profile.user = user;
      }

      const profileFields = [
        'bio',
        'country',
        'state',
        'city',
        'address',
        'interests',
        'image',
      ];

      for (const field of profileFields) {
        if (updateProfileDto[field] !== undefined) {
          profile[field] = updateProfileDto[field];
        }
      }

      await queryRunner.manager.save(profile);

      await queryRunner.commitTransaction();

      // Reload user with profile
      return this.userRepository.findOne({
        where: { id: user.id },
        relations: ['profile', 'kyc'],
      });
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}
