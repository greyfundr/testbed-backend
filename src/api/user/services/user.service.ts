import { Injectable } from '@nestjs/common';
import { UpdateUserDto, UpdateProfileDto } from '../dtos';
import { User } from '../entities';
import { UserRepository } from '../repository/user.repository';

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  async findOneByUuid(uuid: string) {
    return this.userRepository.findOne({
      where: { uuid },
    });
  }

  update(id: number, updateUserDto: UpdateUserDto) {
    return this.userRepository.update(id, updateUserDto);
  }

  remove(id: number) {
    return this.userRepository.remove(id);
  }

  async updateProfile(user: User, updateProfileDto: UpdateProfileDto) {
    if (updateProfileDto.firstName) {
      user.firstName = updateProfileDto.firstName;
    }
    if (updateProfileDto.lastName) {
      user.lastName = updateProfileDto.lastName;
    }
    return await this.userRepository.save(user);
  }
}
