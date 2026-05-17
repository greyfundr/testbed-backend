import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSplitBillUpdateDto {
  @IsString()
  @MaxLength(4000)
  body: string;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}

export interface SplitBillUpdateAuthorDto {
  id: string;
  firstName?: string;
  lastName?: string;
  profileImage?: string;
}

export interface SplitBillUpdateResponseDto {
  id: string;
  splitBillId: string;
  body: string;
  pinned: boolean;
  createdAt: Date;
  author: SplitBillUpdateAuthorDto;
}
