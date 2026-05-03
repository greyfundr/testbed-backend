import {
  IsString,
  IsInt,
  IsOptional,
  IsEnum,
  IsArray,
  ValidateNested,
  IsUUID,
  IsEmail,
  Matches,
  Min,
  Max,
  IsBoolean,
  IsDateString,
  MinLength,
  MaxLength,
  IsIn,
  ArrayMinSize,
  IsNumber,
  IsNotEmpty,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  SplitMethod,
  SplitBillStatus,
  MyBillsRole,
  ParticipantStatus,
} from '../enums/split-bill.enum';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// export class UserParticipantDto {
//   @IsIn(['USER'])
//   type: 'USER';

//   @IsUUID()
//   userId: string;

//   @IsOptional()
//   @IsInt()
//   @Min(1)
//   amount?: number;

//   @IsOptional()
//   @IsInt()
//   @Min(1)
//   @Max(100)
//   percentage?: number;
// }

// export class GuestParticipantDto {
//   @IsIn(['GUEST'])
//   type: 'GUEST';

//   @IsString()
//   @MinLength(2)
//   @MaxLength(100)
//   name: string;

//   @Matches(/^\+?[0-9]{10,15}$/, { message: 'Invalid phone number format' })
//   phone: string;

//   @IsOptional()
//   @IsEmail()
//   email?: string;

//   @IsOptional()
//   @IsInt()
//   @Min(1)
//   amount?: number;

//   @IsOptional()
//   @IsInt()
//   @Min(1)
//   @Max(100)
//   percentage?: number;
// }

export abstract class BaseParticipantDto {
  @IsIn(['USER', 'GUEST'])
  type: 'USER' | 'GUEST';

  @IsNumber()
  @IsOptional()
  amount?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  percentage?: number;
}

export class UserParticipantDto extends BaseParticipantDto {
  @IsUUID()
  userId: string;
}

export class GuestParticipantDto extends BaseParticipantDto {
  @IsString()
  @MinLength(2)
  name: string;

  @Matches(/^\+?[0-9]{10,15}$/)
  phone: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class RedistributionItemDto {
  @IsUUID()
  participantId: string;

  @IsInt()
  @Min(0)
  value: number;
}

// export class SplitBillOfferDto {
//   @IsString()
//   @IsNotEmpty()
//   title: string;

//   @IsOptional()
//   @IsString()
//   description?: string;

//   @IsNumber()
//   @Min(0)
//   value: number;
// }

class SplitBillOfferDto {
  @IsEnum(['auto', 'manual'])
  type: 'auto' | 'manual';

  @IsString()
  condition: string;

  @IsString()
  reward: string;
}

export class CreateSplitBillDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  @IsIn(['NGN', 'USD', 'GBP', 'EUR'])
  currency?: string;

  @IsEnum(SplitMethod)
  splitMethod: SplitMethod;

  @ValidateNested({ each: true })
  @Type(() => UserParticipantDto, {
    discriminator: {
      property: 'type',
      subTypes: [
        { value: UserParticipantDto, name: 'USER' },
        { value: GuestParticipantDto, name: 'GUEST' },
      ],
    },
    keepDiscriminatorProperty: true,
  })
  participants: Array<UserParticipantDto | GuestParticipantDto>;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  billReceipt?: string;

  @IsOptional()
  @IsBoolean()
  allowPartialPayment?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minPaymentAmount?: number;

  @IsOptional()
  @IsIn(['invoice', 'campaign', 'request', 'manual'])
  sourceBillType?: string;

  @IsOptional()
  @IsUUID()
  sourceBillId?: string;

  @IsOptional()
  @IsUUID()
  recipientUserId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SplitBillOfferDto)
  offers?: SplitBillOfferDto[];
}

export class UpdateParticipantDto {
  @IsOptional()
  @IsEnum(['USER', 'GUEST'])
  type?: 'USER' | 'GUEST';

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  percentage?: number;
}

export class UpdateSplitBillDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsEnum(SplitMethod)
  splitMethod?: SplitMethod;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  billReceipt?: string;

  @IsOptional()
  @IsBoolean()
  allowPartialPayment?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minPaymentAmount?: number;

  @IsOptional()
  @IsUUID()
  recipientUserId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateParticipantDto)
  participants?: UpdateParticipantDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SplitBillOfferDto)
  offers?: SplitBillOfferDto[];
}

export class AddParticipantDto {
  @IsIn(['USER', 'GUEST'])
  type: 'USER' | 'GUEST';

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @Matches(/^\+?[0-9]{10,15}$/)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number; // Naira — required for MANUAL split

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  percentage?: number; // required for PERCENTAGE split

  /**
   * Required when adding to MANUAL or PERCENTAGE split where there's no room.
   * Tells the service how to redistribute existing participants' shares.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RedistributionItemDto)
  redistribution?: RedistributionItemDto[];
}

// ─── Remove Participant ───────────────────────────────────────────────────────

export class RemoveParticipantDto {
  /**
   * Required for MANUAL/PERCENTAGE splits — how to redistribute the removed
   * participant's share among remaining participants.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RedistributionItemDto)
  redistribution?: RedistributionItemDto[];
}

export enum BillPaymentMethod {
  WALLET = 'wallet',
  PAYSTACK = 'paystack',
}

export class PayBillShareDto {
  @ApiProperty({ description: 'Amount to pay in Naira', minimum: 0.01 })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({ enum: BillPaymentMethod })
  @IsEnum(BillPaymentMethod)
  paymentMethod: BillPaymentMethod;

  @ApiPropertyOptional({
    description: 'Transaction PIN — required for wallet payments',
  })
  @ValidateIf((o) => o.paymentMethod === BillPaymentMethod.WALLET)
  @IsString()
  @IsNotEmpty()
  transactionPin?: string;

  @ApiPropertyOptional({
    description:
      'Pay on behalf of another participant. ' +
      'If omitted, payment applies to your own participantId (passed in the URL). ' +
      'The payer wallet is always the authenticated user — only the credited share changes.',
  })
  @IsOptional()
  @IsString()
  @IsUUID()
  onBehalfOfParticipantId?: string;

  @ApiPropertyOptional({
    description: 'Optional message attached to this payment',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;

  @ApiPropertyOptional({
    enum: ['full_name', 'username', 'anonymous'],
    default: 'full_name',
    description: 'How your name appears on the payment comment',
  })
  @IsOptional()
  @IsIn(['full_name', 'username', 'anonymous'])
  commentDisplayType?: CommentDisplayType = 'full_name';
}

export class GuestPayBillShareDto {
  @IsInt()
  @Min(1)
  amount: number;

  /** Paystack reference from guest's card/bank payment */
  @IsString()
  gatewayReference: string;

  @IsOptional()
  @IsString()
  paymentGateway?: string;
}

// ─── Cancel Bill ──────────────────────────────────────────────────────────────

export class CancelBillDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

// ─── Query ────────────────────────────────────────────────────────────────────

export class GetUserBillsDto {
  @IsOptional()
  @IsEnum(SplitBillStatus)
  status?: SplitBillStatus;

  @IsOptional()
  @IsIn(['creator', 'participant', 'all'])
  role?: 'creator' | 'participant' | 'all';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;
}

export class GetMyBillsDto {
  @IsOptional()
  @IsEnum(SplitBillStatus)
  status?: SplitBillStatus;

  @IsOptional()
  @IsEnum(MyBillsRole)
  role?: MyBillsRole = MyBillsRole.ALL;

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
export class GetMyInvitesDto {
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

export class MyParticipantSlice {
  participantId: string;
  role: string;
  amountOwed: number;
  amountPaid: number;
  amountRemaining: number;
  status: string;
  inviteCode: string | null;
  paymentLink: string | null;
}

export class MyBillItem {
  // Bill fields
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  billReceipt: string | null;
  totalAmount: number;
  totalCollected: number;
  currency: string;
  splitMethod: string;
  status: string;
  dueDate: Date | null;
  totalParticipants: number;
  totalPaidParticipants: number;
  isFinalized: boolean;
  creatorId: string;
  createdAt: Date;
  myShare: MyParticipantSlice;
}

export type CommentDisplayType = 'full_name' | 'username' | 'anonymous';

export class AddSplitBillCommentDto {
  @ApiProperty({ description: 'Comment content', maxLength: 2000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;

  @ApiPropertyOptional({
    description: 'How you want your name to appear on the comment',
    enum: ['full_name', 'username', 'anonymous'],
    default: 'full_name',
  })
  @IsOptional()
  @IsIn(['full_name', 'username', 'anonymous'])
  displayType?: CommentDisplayType = 'full_name';
}

export class EditSplitBillCommentDto {
  @ApiProperty({ description: 'Updated comment content', maxLength: 2000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;
}

export class GetBillCommentsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}

export class BillQueryDto {
  @ApiProperty({
    description: 'Your message or concern about this bill to the creator',
    maxLength: 1000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  message: string;
}
