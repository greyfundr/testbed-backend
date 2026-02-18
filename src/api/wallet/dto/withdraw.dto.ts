import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsInt, Min } from 'class-validator';

export class WithdrawDto {
  @ApiProperty({
    description: 'Bank account id',
    example: '',
  })
  @IsUUID()
  bankAccountId: string;

  @ApiProperty({
    description: 'amount',
    example: 50000,
  })
  @IsInt({ message: 'Amount must be an integer in kobo' })
  @Min(10_000, { message: 'Minimum withdrawal is ₦100 (10,000 kobo)' })
  amount: number;
}
