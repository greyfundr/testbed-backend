import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SendChatMessageDto {
  @ApiProperty({
    description: 'Message body. Plain text — no formatting yet.',
    example: 'hey, are you free to discuss the bill?',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body: string;
}
