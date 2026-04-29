import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsUUID } from 'class-validator';
import { FriendRequestStatus } from '../enums/user.enum';

export class SendFriendRequestDto {
  @ApiProperty({
    description: 'The UUID of the user to send the friend request to',
  })
  @IsUUID()
  @IsNotEmpty()
  receiverId: string;
}

export class UpdateFriendRequestDto {
  @ApiProperty({
    enum: [FriendRequestStatus.ACCEPTED, FriendRequestStatus.REJECTED],
  })
  @IsEnum([FriendRequestStatus.ACCEPTED, FriendRequestStatus.REJECTED])
  @IsNotEmpty()
  status: FriendRequestStatus.ACCEPTED | FriendRequestStatus.REJECTED;
}
