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
}

class DetailedDescriptionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  text: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  media: string[];
}

class ItemToBuyDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  image: string;

  @ApiProperty()
  @IsNumber()
  price: number;

  @ApiProperty()
  @IsNumber()
  quantity: number;
}

class OrganizerDto {
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
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  shortDescription: string;

  @ApiProperty()
  @ValidateNested()
  @Type(() => DetailedDescriptionDto)
  detailedDescription: DetailedDescriptionDto;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @ApiProperty()
  @ValidateNested()
  @Type(() => EventLocationDto)
  location: EventLocationDto;

  @ApiProperty()
  @IsString()
  @MaxLength(30)
  hashtag: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  targetAmount?: number;

  @ApiProperty()
  @IsDateString()
  eventTime: string;

  @ApiPropertyOptional({ type: [ItemToBuyDto] })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ItemToBuyDto)
  itemsToBuy?: ItemToBuyDto[];

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  expectedParticipants?: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  venueName: string;

  @ApiProperty({ type: [OrganizerDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrganizerDto)
  organizers: OrganizerDto[];
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
