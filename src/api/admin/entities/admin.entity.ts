import { Entity, Column } from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { Exclude } from 'class-transformer';

@Entity('admins')
export class Admin extends AbstractEntity {
  @Column({ unique: true })
  email: string;

  @Exclude()
  @Column()
  password: string;

  @Column({ type: 'varchar', nullable: true, name: 'first_name' })
  firstName: string | null;

  @Column({ type: 'varchar', nullable: true, name: 'last_name' })
  lastName: string | null;
}
