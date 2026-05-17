import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

// Mirrors `CreateOrganizerDto` from campaign-extras.dto but trimmed to
// what split-bills actually need today (no verified / brandColor /
// sortOrder). Easy to add later if a use case appears.
export class CreateSplitBillOrganizerDto {
  @ApiPropertyOptional({
    description: 'Existing platform user to link as organizer',
    example: 'uuid',
  })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiProperty({ description: 'Display name', example: 'Jane Doe' })
  @IsString()
  @MaxLength(150)
  displayName: string;

  @ApiPropertyOptional({
    description: 'Role / title',
    example: 'Bill admin',
    default: 'Organiser',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  role?: string;

  @ApiPropertyOptional({ description: 'Avatar URL' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;
}

export class UpdateSplitBillOrganizerDto {
  @IsOptional() @IsString() @MaxLength(150) displayName?: string;
  @IsOptional() @IsString() @MaxLength(200) role?: string;
  @IsOptional() @IsString() @MaxLength(500) avatarUrl?: string;
}

export class RejectSplitBillOrganizerInvitationDto {
  @ApiPropertyOptional({
    description: 'Optional free-text reason the invitee is declining',
    example: 'Schedule clash this month.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
