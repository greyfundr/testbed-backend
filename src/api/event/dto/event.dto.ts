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
  IsBoolean,
  Max,
  Min,
  IsInt,
  IsEmail,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  EventStatus,
  EventOrganizerRole,
  EventContributionType,
  EventPaymentMethod,
  EventVisibilityStatus,
} from '../enums/event.enum';
import { RsvpStatus } from '../entities';

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
  title: string;

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
  category: string;

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

  @IsEnum(EventVisibilityStatus)
  @IsOptional()
  visibilityStatus?: EventVisibilityStatus;

  // @ApiProperty({ type: [ExternalOrganizerDto] })
  // @IsArray()
  // @IsOptional()
  // @ValidateNested({ each: true })
  // @Type(() => ExternalOrganizerDto)
  // organizers?: ExternalOrganizerDto[];

  // @ApiProperty({ type: [InternalOrganizerDto] })
  // @IsArray()
  // @IsOptional()
  // @ValidateNested({ each: true })
  // @Type(() => InternalOrganizerDto)
  // internalOrganizers?: InternalOrganizerDto[];

  // @ApiProperty({ type: [DetailedDescriptionSegmentDto] })
  // @IsArray()
  // @ValidateNested({ each: true })
  // @Type(() => DetailedDescriptionSegmentDto)
  // detailedDescription: DetailedDescriptionSegmentDto[];

  // @ApiProperty()
  // @ValidateNested()
  // @Type(() => EventLocationDto)
  // location: EventLocationDto;

  // @ApiProperty()
  // @ValidateNested()
  // @Type(() => EventFinancingDto)
  // financing: EventFinancingDto;
}

export class UpdateEventDraftDto {
  @IsNumber()
  @Min(1)
  @Max(4)
  pageNumber: number;

  // ── Step 1 fields ──────────────────────────────────────────────────────────
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  hashtag?: string;

  @IsString()
  @IsOptional()
  shortDescription?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  coverImages?: string[];

  // ── Step 2 fields ──────────────────────────────────────────────────────────
  @IsDateString()
  @IsOptional()
  startDateTime?: string;

  @IsString()
  @IsOptional()
  startTime?: string;

  @IsBoolean()
  @IsOptional()
  spanMultipleDays?: boolean;

  @IsDateString()
  @IsOptional()
  endDateTime?: string;

  @ValidateNested()
  @Type(() => EventLocationDto)
  @IsOptional()
  location?: EventLocationDto;

  // ── Step 3 fields ──────────────────────────────────────────────────────────
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => DetailedDescriptionSegmentDto)
  detailedDescription?: DetailedDescriptionSegmentDto[];

  @IsNumber()
  @IsOptional()
  targetAmount?: number;

  @IsNumber()
  @IsOptional()
  expectedParticipants?: number;

  @IsBoolean()
  @IsOptional()
  acceptDonations?: boolean;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => PurchasableItemDto)
  purchasableItems?: PurchasableItemDto[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => EventActivityDto)
  activities?: EventActivityDto[];

  // ── Step 4 fields ──────────────────────────────────────────────────────────
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ExternalOrganizerDto)
  organizers?: ExternalOrganizerDto[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => InternalOrganizerDto)
  internalOrganizers?: InternalOrganizerDto[];

  @IsEnum(EventVisibilityStatus)
  @IsOptional()
  visibilityStatus?: EventVisibilityStatus;

  @ApiProperty()
  @IsOptional()
  isPublished?: boolean;
}

export class ContributeToEventDto {
  @ApiProperty({ enum: EventContributionType })
  @IsEnum(EventContributionType)
  type: EventContributionType;

  @ApiProperty()
  @IsNumber()
  amount: number;

  @ApiProperty({ enum: EventPaymentMethod, default: EventPaymentMethod.WALLET })
  @IsEnum(EventPaymentMethod)
  @IsOptional()
  paymentMethod?: EventPaymentMethod = EventPaymentMethod.WALLET;

  @ApiProperty()
  @IsOptional()
  details?: any;
}

export class GetAllEventsDto {
  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(['private', 'private_invitation', 'public', 'public_registration'])
  visibilityStatus?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}

export class GetMyEventsDto extends GetAllEventsDto {
  @IsOptional()
  @IsEnum(['published', 'draft', 'all'])
  publishedStatus?: 'published' | 'draft' | 'all' = 'all';
}

// ── RSVP related DTOs ──────────────────────────────────────────────────────────

export class RsvpDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(RsvpStatus)
  @IsOptional()
  status?: RsvpStatus = RsvpStatus.ATTENDING;

  @IsInt()
  @Min(1)
  @Max(10)
  @IsOptional()
  @Type(() => Number)
  guestCount?: number = 1;

  @IsString()
  @IsOptional()
  note?: string;
}

export class GuestRsvpDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  // At least one contact required for guests
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEnum(RsvpStatus)
  @IsOptional()
  status?: RsvpStatus = RsvpStatus.ATTENDING;

  @IsInt()
  @Min(1)
  @Max(10)
  @IsOptional()
  @Type(() => Number)
  guestCount?: number = 1;

  @IsString()
  @IsOptional()
  note?: string;
}

export class UpdateRsvpDto {
  @IsEnum(RsvpStatus)
  @IsOptional()
  status?: RsvpStatus;

  @IsInt()
  @Min(1)
  @Max(10)
  @IsOptional()
  @Type(() => Number)
  guestCount?: number;

  @IsString()
  @IsOptional()
  note?: string;
}

export class GetMyRsvpEventsDto {
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  @IsOptional()
  @IsEnum(RsvpStatus)
  rsvpStatus?: RsvpStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}
