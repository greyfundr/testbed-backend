import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { AbstractEntity } from '../../../common/entities';
import { User } from '../../user/entities';
import { Event } from './event.entity';
import { Transaction } from '../../transaction/entities';
import { EventContributionType } from '../enums/event.enum';
import { BigIntAmountTransformer } from '../../../common/transformers/column-numeric.transformer';

@Entity('event_contributions')
export class EventContribution extends AbstractEntity {
  @Column({ name: 'event_id' })
  eventId: string;

  @ManyToOne(() => Event, (event) => event.contributions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'event_id' })
  event: Event;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    type: 'enum',
    enum: EventContributionType,
  })
  type: EventContributionType;

  @ApiProperty({ description: 'Contribution amount' })
  @Column({
    type: 'bigint',
    default: 0,
    transformer: new BigIntAmountTransformer(),
  })
  amount: number;

  @Column({ type: 'json', nullable: true })
  details: any;

  @Column({ name: 'transaction_id', nullable: true })
  transactionId: string;

  @ManyToOne(() => Transaction)
  @JoinColumn({ name: 'transaction_id' })
  transaction: Transaction;
}
