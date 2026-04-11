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
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  SplitMethod,
  SplitBillStatus,
  MyBillsRole,
} from '../enums/split-bill.enum';

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

  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;

  @IsOptional()
  @IsInt()
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
  @MaxLength(100)
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

export class CreateSplitBillDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsInt()
  @Min(100)
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
  @IsInt()
  @Min(100)
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
}

// ─── Update Bill ──────────────────────────────────────────────────────────────

export class UpdateParticipantDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  guestName?: string;

  @IsOptional()
  @IsString()
  guestPhone?: string;

  // Required when splitMethod is MANUAL — the exact amount this participant owes
  @IsOptional()
  @IsInt()
  @Min(0)
  amountOwed?: number;

  // Required when splitMethod is PERCENTAGE
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
  @IsInt()
  @Min(100)
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
  @IsUUID()
  recipientUserId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateParticipantDto)
  participants?: UpdateParticipantDto[];
}

// ─── Add Participant ──────────────────────────────────────────────────────────

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

// ─── Pay Bill Share ───────────────────────────────────────────────────────────

export class PayBillShareDto {
  /**
   * Amount to pay in Naira. Must not exceed amountRemaining on the participant.
   * If allowPartialPayment=false, must equal the full amountRemaining.
   */
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  // @IsNotEmpty()
  @IsOptional()
  transactionPin: string;
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
