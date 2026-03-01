import { AdminRepository } from '../repository/admin.repository';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AdminLoginDto, AdminCreateDto } from '../dto/admin.dto';
import {
  UnauthorizedException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly adminRepository: AdminRepository,
    private readonly jwtService: JwtService,
  ) {}

  async createAdmin(dto: AdminCreateDto) {
    const existingAdmin = await this.adminRepository.findOne({
      where: { email: dto.email },
    });

    if (existingAdmin) {
      throw new ConflictException('Admin with this email already exists');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(dto.password, salt);

    const newAdmin = await this.adminRepository.create({
      ...dto,
      password: hashedPassword,
    });

    // Omit password from returning object
    const { password, ...result } = newAdmin;
    return result;
  }

  async login(dto: AdminLoginDto) {
    const admin = await this.adminRepository.findOne({
      where: { email: dto.email },
    });

    if (!admin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(dto.password, admin.password);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = {
      sub: admin.id,
      email: admin.email,
      type: 'admin',
    };

    const token = await this.jwtService.signAsync(payload);

    return {
      accessToken: token,
      admin: {
        id: admin.id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
      },
    };
  }
}
