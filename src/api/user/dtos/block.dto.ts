import { IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BlockUserDto {
  @ApiProperty({ description: 'The UUID of the user to block/unblock' })
  @IsUUID()
  @IsNotEmpty()
  blockedId: string;
}
