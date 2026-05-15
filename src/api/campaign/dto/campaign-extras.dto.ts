import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsArray,
  ValidateNested,
  Min,
  MaxLength,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';

/* ===== ORGANIZERS ===== */

export class CreateOrganizerDto {
  @ApiPropertyOptional({
    description: 'Existing platform user to link as organizer',
    example: 'uuid',
  })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiProperty({ description: 'Display name', example: 'Dr. John Waterman' })
  @IsString()
  @MaxLength(150)
  displayName: string;

  @ApiProperty({
    description: 'Role / title',
    example: 'Head of Mission – Doctors Without Borders',
  })
  @IsString()
  @MaxLength(200)
  role: string;

  @ApiPropertyOptional({ description: 'Avatar URL' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;

  @ApiPropertyOptional({
    description: 'Brand color hex (used when no avatar)',
    example: '#1CABE2',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  brandColor?: string;

  @ApiPropertyOptional({ description: 'Verified badge', default: false })
  @IsOptional()
  @IsBoolean()
  verified?: boolean;

  @ApiPropertyOptional({
    description: 'Sort order in the rail',
    default: 0,
  })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateOrganizerDto {
  @IsOptional() @IsString() @MaxLength(150) displayName?: string;
  @IsOptional() @IsString() @MaxLength(200) role?: string;
  @IsOptional() @IsString() @MaxLength(500) avatarUrl?: string;
  @IsOptional() @IsString() @MaxLength(20) brandColor?: string;
  @IsOptional() @IsBoolean() verified?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}

export class RejectOrganizerInvitationDto {
  @ApiPropertyOptional({
    description: 'Optional free-text reason the invitee is declining',
    example: 'I can only commit to one campaign per quarter.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

/* ===== AMPLIFIERS ===== */

export class TopAmplifierResponse {
  @ApiProperty() id: string;
  @ApiProperty() userId: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional() avatar?: string;
  @ApiProperty() code: string;
  @ApiProperty({ description: 'Total raised through this amplifier link' })
  influencedAmount: number;
  @ApiProperty({ description: 'Number of donations attributed' })
  referralCount: number;
}

/* ===== EXPENDITURES ===== */

export class ExpenditureReceiptDto {
  @ApiProperty({ description: 'Receipt URL (Cloudinary)' })
  @IsString()
  url: string;

  @ApiPropertyOptional({ description: 'Cloudinary provider id' })
  @IsOptional()
  @IsString()
  providerId?: string;
}

export class CreateExpenditureDto {
  @ApiProperty({ description: 'Line label', example: 'Boat rental — 4 days' })
  @IsString()
  @MaxLength(255)
  label: string;

  @ApiProperty({ description: 'Amount in Naira' })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiPropertyOptional({
    description: 'Optional id of the budget line this draws from',
    example: 'b2',
  })
  @IsOptional()
  @IsString()
  budgetRef?: string;

  @ApiPropertyOptional({
    description: 'Receipt attachments',
    type: [ExpenditureReceiptDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExpenditureReceiptDto)
  receipts?: ExpenditureReceiptDto[];
}

export class UpdateExpenditureDto {
  @IsOptional() @IsString() @MaxLength(255) label?: string;
  @IsOptional() @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsString() budgetRef?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExpenditureReceiptDto)
  receipts?: ExpenditureReceiptDto[];
}
