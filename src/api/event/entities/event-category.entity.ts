import { Entity, Column } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { AbstractEntity } from '../../../common/entities';

@Entity('event_categories')
export class EventCategory extends AbstractEntity {
  @ApiProperty({
    description: 'Category name',
    example: 'Conference',
  })
  @Column({ unique: true })
  name: string;

  @ApiProperty({
    description: 'Category icon URL or identifier',
    example: 'conference-icon',
  })
  @Column({ nullable: true })
  icon: string;

  @ApiProperty({
    description: 'Status of the category',
    example: true,
  })
  @Column({ default: true, name: 'is_active' })
  isActive: boolean;
}
