import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AbstractEntity } from '../../../common/entities';
import { User } from '../../user/entities';
import { Transaction } from '../../transaction/entities';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';
import { Campaign } from './campaign.entity';
import { DonationOnBehalfOf } from '../enums/campaign.enum';

@Entity('donations')
export class Donation extends AbstractEntity {
  @ApiProperty({
    description: 'Donation amount in Naira (stored as kobo in DB)',
    example: 5000,
  })
  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  amount: number; // Stored in kobo, retrieved as Naira

  @ApiProperty({
    description: 'ID of the donor',
    example: 'uuid',
  })
  @Column({ name: 'donor_id', length: 255 })
  donorId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'donor_id' })
  donor: User;

  @ApiProperty({
    description: 'ID of the campaign',
    example: 'uuid',
  })
  @Column({ name: 'campaign_id', length: 255 })
  campaignId: string;

  @ManyToOne(() => Campaign, (campaign) => campaign.donations)
  @JoinColumn({ name: 'campaign_id' })
  campaign: Campaign;

  @ApiPropertyOptional({
    description: 'ID of the associated transaction',
    example: 'uuid',
  })
  @Column({ name: 'transaction_id', nullable: true, length: 255 })
  transactionId: string;

  @ManyToOne(() => Transaction)
  @JoinColumn({ name: 'transaction_id' })
  transaction: Transaction;

  @ApiProperty({
    description: 'Whether the donation is anonymous',
    example: false,
  })
  @Column({ type: 'tinyint', default: 0, name: 'is_anonymous' })
  isAnonymous: boolean;

  @ApiPropertyOptional({
    description: 'Custom username for display',
    example: 'SuperHelper',
  })
  @Column({ name: 'custom_username', nullable: true })
  customUsername?: string;

  @ApiProperty({
    description: 'Entity being donated on behalf of',
    enum: DonationOnBehalfOf,
    default: DonationOnBehalfOf.SELF,
  })
  @Column({
    type: 'enum',
    enum: DonationOnBehalfOf,
    default: DonationOnBehalfOf.SELF,
    name: 'on_behalf_of',
  })
  onBehalfOf: DonationOnBehalfOf;

  @ApiPropertyOptional({
    description: 'User ID if onBehalfOf is USER',
    example: 'uuid',
  })
  @Column({ name: 'on_behalf_of_user_id', nullable: true, length: 255 })
  onBehalfOfUserId?: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'on_behalf_of_user_id' })
  onBehalfOfUser: User;

  @ApiPropertyOptional({
    description: 'Full name of external person if onBehalfOf is EXTERNAL',
    example: 'John Doe',
  })
  @Column({ name: 'on_behalf_of_full_name', nullable: true })
  onBehalfOfFullName?: string;

  @ApiPropertyOptional({
    description: 'Phone number of external person if onBehalfOf is EXTERNAL',
    example: '+2348012345678',
  })
  @Column({ name: 'on_behalf_of_phone', nullable: true })
  onBehalfOfPhone?: string;

  @ApiPropertyOptional({
    description: 'Optional comment',
    example: 'Keep it up!',
  })
  @Column({ type: 'text', nullable: true })
  comment?: string;
}
