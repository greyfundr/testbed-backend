import {
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  Max,
  IsSemVer,
  IsString,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetNotificationsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by read status' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isRead?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by notification type e.g. split_bill, kyc, security',
  })
  @IsOptional()
  type?: string;
}

export class MarkNotificationsReadDto {
  @ApiPropertyOptional({
    description:
      'Specific notification IDs to mark as read. If omitted, marks ALL as read.',
  })
  @IsOptional()
  @IsString({ each: true })
  ids?: string[];
}
