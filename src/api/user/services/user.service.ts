import { Injectable } from '@nestjs/common';
import { UpdateUserDto } from '../dtos';
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
}
