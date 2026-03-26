import { Entity, Column, OneToMany } from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { DynamicLink } from './dynamic-link.entity';

export interface IosConfig {
  bundleId: string;
  appStoreUrl: string;
  teamId: string;
}

export interface AndroidConfig {
  packageName: string;
  playStoreUrl: string;
  sha256CertFingerprints: string[];
}

@Entity('dynamic_link_projects')
export class DynamicLinkProject extends AbstractEntity {
  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 50, name: 'app_scheme' })
  appScheme: string;

  @Column({ type: 'json' })
  ios: IosConfig;

  @Column({ type: 'json' })
  android: AndroidConfig;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean;

  @OneToMany(() => DynamicLink, (link) => link.project)
  links: DynamicLink[];
}
