import { Entity, Column } from 'typeorm';
import { AbstractEntity } from '../../../common/entities';
import { ColumnNumericTransformer } from '../../../common/transformers/column-numeric.transformer';

// Admin-tunable points value per action. Look-up by `actionCode`. New
// surfaces add their own codes (e.g. `event.attendance`) by inserting
// new rows — no schema change required.
@Entity('points_rules')
export class PointsRule extends AbstractEntity {
  @Column({ name: 'action_code', length: 128, unique: true })
  actionCode: string;

  @Column({ type: 'int', default: 0 })
  points: number;

  // Non-null switches the rule into amount-scaled mode: awarded points
  // = round(per_kobo_multiplier * donation_amount_in_kobo). Lets a flat
  // rule become "1 point per ₦100" later with just a row edit.
  @Column({
    type: 'decimal',
    precision: 16,
    scale: 8,
    nullable: true,
    name: 'per_kobo_multiplier',
    transformer: new ColumnNumericTransformer(),
  })
  perKoboMultiplier?: number | null;

  @Column({ name: 'is_active', type: 'tinyint', default: 1 })
  isActive: boolean;

  @Column({ length: 255, nullable: true })
  description?: string | null;
}
