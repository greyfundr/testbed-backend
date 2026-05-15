import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  Min,
  MaxLength,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProposalVoteValue } from '../enums/campaign.enum';

export class ProposalAllocationDto {
  @ApiPropertyOptional({
    description: 'id of the campaign budget item this draws from',
    example: 'b2',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  budgetRef?: string;

  @ApiProperty({ example: 'Boat rental — 4 days' })
  @IsString()
  @MaxLength(200)
  label: string;

  @ApiProperty({ example: 80000 })
  @IsNumber()
  @Min(0)
  amount: number;
}

export class CreateProposalDto {
  @ApiProperty({ example: 'Pay hospital for surgery' })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({
    description: 'Why this disbursement is needed',
  })
  @IsOptional()
  @IsString()
  purpose?: string;

  @ApiPropertyOptional({
    description: 'Saved vendor id to pay (campaign-scoped)',
  })
  @IsOptional()
  @IsString()
  vendorId?: string;

  @ApiProperty({
    type: [ProposalAllocationDto],
    description: 'Split of total across budget items',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProposalAllocationDto)
  allocations: ProposalAllocationDto[];
}

export class VoteProposalDto {
  @ApiProperty({ enum: ProposalVoteValue })
  @IsEnum(ProposalVoteValue)
  vote: ProposalVoteValue;
}
