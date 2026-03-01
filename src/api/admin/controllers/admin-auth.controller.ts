import { Controller, Post, Body } from '@nestjs/common';
import { AdminService } from '../services/admin.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AdminLoginDto, AdminCreateDto } from '../dto/admin.dto';

@ApiTags('Admin')
@Controller('admin')
export class AdminAuthController {
  constructor(private readonly adminService: AdminService) {}

  @ApiOperation({ summary: 'Create initial systemic Admin account' })
  @Post('auth/create')
  async createAdmin(@Body() body: AdminCreateDto) {
    const admin = await this.adminService.createAdmin(body);
    return {
      success: true,
      message: 'Admin account created successfully',
      data: admin,
    };
  }

  @ApiOperation({ summary: 'Admin Login' })
  @Post('auth/login')
  async login(@Body() body: AdminLoginDto) {
    const response = await this.adminService.login(body);
    return {
      success: true,
      message: 'Admin login successful',
      ...response,
    };
  }
}
