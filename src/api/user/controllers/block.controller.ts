import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../entities';
import { BlockService } from '../services/block.service';
import { BlockUserDto } from '../dtos/block.dto';

@ApiTags('Block')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('users/block')
export class BlockController {
  constructor(private readonly blockService: BlockService) {}

  @Post('')
  @ApiOperation({ summary: 'Block a user' })
  blockUser(@CurrentUser() user: User, @Body() dto: BlockUserDto) {
    return this.blockService.blockUser(user.id, dto.blockedId);
  }

  @Delete(':blockedId')
  @ApiOperation({ summary: 'Unblock a user' })
  unblockUser(
    @CurrentUser() user: User,
    @Param('blockedId') blockedId: string,
  ) {
    return this.blockService.unblockUser(user.id, blockedId);
  }

  @Get('')
  @ApiOperation({ summary: 'Get list of blocked users' })
  getBlockedUsers(@CurrentUser() user: User) {
    return this.blockService.getBlockedUsers(user.id);
  }
}
