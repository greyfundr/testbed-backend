import { IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FollowUserDto {
  @ApiProperty({ description: 'The UUID of the user to follow/unfollow' })
  @IsUUID()
  @IsNotEmpty()
  followingId: string;
}
