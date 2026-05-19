import {
  Entity,
  Column,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

// Denormalized per-user interest vector. Rebuilt on every relevant
// engagement (donation / save / like / comment / amplifier signup /
// view) so the For You feed can do a cheap `JSON` lookup instead of
// summing the user's whole event history on every request.
@Entity('user_interest_profiles')
export class UserInterestProfile {
  @PrimaryColumn({ name: 'user_id', length: 36 })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // `{ tag: weight }` map. Weight is a non-negative number; higher
  // means stronger inferred interest in that tag. The set of tags
  // is whatever the tag-derivation service emitted for campaigns
  // the user engaged with.
  @Column({ name: 'tag_weights_json', type: 'json' })
  tagWeights: Record<string, number>;

  @Column({ name: 'last_event_at', type: 'timestamp', nullable: true })
  lastEventAt: Date | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
