import {
  Controller,
  Get,
  Param,
  Res,
  HttpStatus,
  Body,
  Delete,
  HttpCode,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { DynamicLinkService } from '../services/dynamic-link.service';
import { DynamicLinkProject, DynamicLink } from '../entities';
import { DynamicLinkProjectRepository } from '../repository';
import {
  CreateDynamicLinkProjectDto,
  UpdateDynamicLinkProjectDto,
} from '../dtos/dynamic-link.dto';
import { AdminJwtAuthGuard } from 'src/api/admin/guards/admin.guard';
import { ApiBearerAuth, ApiResponse } from '@nestjs/swagger';

@Controller('dynamic-link')
export class DynamicLinkController {
  constructor(
    private readonly dynamicLinkService: DynamicLinkService,
    private readonly projectRepo: DynamicLinkProjectRepository,
  ) {}

  @ApiBearerAuth()
  @ApiResponse({
    status: 201,
    description: 'Project created successfully',
    type: DynamicLinkProject,
  })
  @UseGuards(AdminJwtAuthGuard)
  @Post()
  async create(@Body() dto: CreateDynamicLinkProjectDto) {
    const project = await this.dynamicLinkService.create(dto);
    return {
      success: true,
      message: 'Project registered successfully',
      data: project,
    };
  }

  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description: 'Project updated successfully',
    type: DynamicLinkProject,
  })
  @UseGuards(AdminJwtAuthGuard)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDynamicLinkProjectDto,
  ) {
    const project = await this.dynamicLinkService.update(id, dto);
    return {
      success: true,
      message: 'Project updated successfully',
      data: project,
    };
  }

  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description: 'Project activated successfully',
    type: DynamicLinkProject,
  })
  @UseGuards(AdminJwtAuthGuard)
  @Patch(':id/activate')
  async activate(@Param('id') id: string) {
    const project = await this.dynamicLinkService.activate(id);
    return { success: true, message: 'Project activated', data: project };
  }

  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description: 'Project deactivated successfully',
    type: DynamicLinkProject,
  })
  @UseGuards(AdminJwtAuthGuard)
  @Patch(':id/deactivate')
  async deactivate(@Param('id') id: string) {
    const project = await this.dynamicLinkService.deactivate(id);
    return { success: true, message: 'Project deactivated', data: project };
  }
}
