import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsOptional,
  IsArray,
  IsUrl,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

export class IosConfigDto {
  @IsString()
  @IsNotEmpty()
  bundleId: string;

  @IsUrl()
  @IsNotEmpty()
  appStoreUrl: string;

  @IsString()
  @IsOptional()
  teamId?: string;
}

export class AndroidConfigDto {
  @IsString()
  @IsNotEmpty()
  packageName: string;

  @IsUrl()
  @IsNotEmpty()
  playStoreUrl: string;

  @IsArray()
  @IsString({ each: true })
  sha256CertFingerprints: string[];
}

export class CreateDynamicLinkProjectDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  // App URL scheme — e.g. "greyfundr" → greyfundr://open
  @IsString()
  @IsNotEmpty()
  appScheme: string;

  @ValidateNested()
  @Type(() => IosConfigDto)
  ios: IosConfigDto;

  @ValidateNested()
  @Type(() => AndroidConfigDto)
  android: AndroidConfigDto;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;
}

export class UpdateDynamicLinkProjectDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  appScheme?: string;

  @ValidateNested()
  @Type(() => IosConfigDto)
  @IsOptional()
  ios?: IosConfigDto;

  @ValidateNested()
  @Type(() => AndroidConfigDto)
  @IsOptional()
  android?: AndroidConfigDto;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
