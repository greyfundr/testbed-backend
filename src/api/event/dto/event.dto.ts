import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsEnum,
  IsArray,
  ValidateNested,
  IsDateString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  EventStatus,
  EventOrganizerRole,
  EventContributionType,
} from '../enums/event.enum';

class EventLocationDto {
  @ApiProperty()
  @IsNumber()
  lat: number;

  @ApiProperty()
  @IsNumber()
  lng: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  locationDescription?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  venueName?: string;
}

class DetailedDescriptionSegmentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  text: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  media: string[];
}

class PurchasableItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  images: string[];

  @ApiProperty()
  @IsNumber()
  price: number;

  @ApiProperty()
  @IsNumber()
  quantity: number;
}

class EventActivityDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  image: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty()
  @IsNumber()
  targetAmount: number;

  @ApiProperty()
  @IsDateString()
  time: string;
}

class EventFinancingDto {
  @ApiProperty()
  @IsNumber()
  @IsOptional()
  targetAmount?: number;

  @ApiProperty()
  @IsNumber()
  @IsOptional()
  expectedParticipants?: number;

  @ApiProperty()
  @IsOptional()
  acceptDonations?: boolean;

  @ApiPropertyOptional({ type: [PurchasableItemDto] })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => PurchasableItemDto)
  purchasableItems?: PurchasableItemDto[];

  @ApiPropertyOptional({ type: [EventActivityDto] })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => EventActivityDto)
  activities?: EventActivityDto[];
}

class ExternalOrganizerDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  number: string;
}

class InternalOrganizerDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ enum: EventOrganizerRole })
  @IsEnum(EventOrganizerRole)
  role: EventOrganizerRole;
}

export class CreateEventDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  hashtag: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  shortDescription: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  category: string; // Mobile sends category name

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  coverImages: string[];

  @ApiProperty()
  @IsDateString()
  startDateTime: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  startTime: string;

  @ApiProperty()
  @IsOptional()
  spanMultipleDays?: boolean;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  endDateTime?: string;

  @ApiProperty({ type: [ExternalOrganizerDto] })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ExternalOrganizerDto)
  organizers?: ExternalOrganizerDto[];

  @ApiProperty({ type: [InternalOrganizerDto] })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => InternalOrganizerDto)
  internalOrganizers?: InternalOrganizerDto[];

  @ApiProperty({ type: [DetailedDescriptionSegmentDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DetailedDescriptionSegmentDto)
  detailedDescription: DetailedDescriptionSegmentDto[];

  @ApiProperty()
  @ValidateNested()
  @Type(() => EventLocationDto)
  location: EventLocationDto;

  @ApiProperty()
  @ValidateNested()
  @Type(() => EventFinancingDto)
  financing: EventFinancingDto;
}

export class UpdateEventDto extends CreateEventDto {}

export class ContributeToEventDto {
  @ApiProperty({ enum: EventContributionType })
  @IsEnum(EventContributionType)
  type: EventContributionType;

  @ApiProperty()
  @IsNumber()
  amount: number;

  @ApiProperty()
  @IsOptional()
  details?: any;
}
