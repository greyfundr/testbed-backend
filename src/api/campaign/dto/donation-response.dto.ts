import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DonationOnBehalfOf } from '../enums/campaign.enum';

export class DonorDto {
    @ApiProperty()
    id: string;

    @ApiPropertyOptional()
    firstName?: string;

    @ApiPropertyOptional()
    lastName?: string;

    @ApiPropertyOptional()
    username?: string;

    @ApiPropertyOptional()
    profileImage?: string;
}

export class DonationResponseDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    amount: number;

    @ApiProperty()
    isAnonymous: boolean;

    @ApiPropertyOptional()
    customUsername?: string;

    @ApiProperty({ enum: DonationOnBehalfOf })
    onBehalfOf: DonationOnBehalfOf;

    @ApiPropertyOptional()
    comment?: string;

    @ApiPropertyOptional({ type: DonorDto })
    donor?: DonorDto;

    @ApiPropertyOptional({ type: DonorDto })
    onBehalfOfUser?: DonorDto;

    @ApiPropertyOptional()
    onBehalfOfFullName?: string;

    @ApiProperty()
    createdAt: Date;
}
