import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { DynamicLinkProject } from './dynamic-link-project.entity';

export type DynamicLinkType = 'event' | 'campaign' | 'split_bill' | 'invite';

@Entity('dynamic_links')
export class DynamicLink extends AbstractEntity {
  @Index()
  @Column({ name: 'project_id' })
  projectId: string;

  @ManyToOne(() => DynamicLinkProject, (p) => p.links, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: DynamicLinkProject;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 12, name: 'short_code' })
  shortCode: string;

  @Index()
  @Column({ type: 'varchar', length: 20 })
  type: DynamicLinkType;

  @Index()
  @Column({ type: 'varchar', length: 36, name: 'resource_id' })
  resourceId: string;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, string> | null;

  @Column({ type: 'int', default: 0 })
  clicks: number;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    name: 'custom_og_title',
  })
  customOgTitle: string | null;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    name: 'custom_og_description',
  })
  customOgDescription: string | null;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    name: 'custom_og_image',
  })
  customOgImage: string | null;
}
