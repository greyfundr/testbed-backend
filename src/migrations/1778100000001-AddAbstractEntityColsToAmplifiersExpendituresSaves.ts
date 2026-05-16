import { MigrationInterface, QueryRunner } from 'typeorm';

// Same drift fix as `AddAbstractEntityColsToCampaignOrganizers` —
// these tables back entities that were promoted to extend
// `AbstractEntity`, but their original migrations predate the change.
// TypeORM's SELECT references `updated_at` / `deleted_at` columns
// that don't exist and throws `ER_BAD_FIELD_ERROR`, which surfaces
// as a blank campaign list on the home screen.
//
// Strictly additive — no drops, no renames. Existing rows backfill
// `updated_at` from `created_at` so the on-update trigger has sane
// initial values.
export class AddAbstractEntityColsToAmplifiersExpendituresSaves1778100000001
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // campaign_amplifiers — needs both columns.
    await queryRunner.query(
      `ALTER TABLE \`campaign_amplifiers\`
         ADD COLUMN \`updated_at\` TIMESTAMP(6)
           NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
           ON UPDATE CURRENT_TIMESTAMP(6),
         ADD COLUMN \`deleted_at\` TIMESTAMP(6) NULL DEFAULT NULL`,
    );
    await queryRunner.query(
      `UPDATE \`campaign_amplifiers\`
         SET \`updated_at\` = \`created_at\`
         WHERE \`updated_at\` IS NULL OR \`updated_at\` < \`created_at\``,
    );

    // campaign_expenditures — needs both columns.
    await queryRunner.query(
      `ALTER TABLE \`campaign_expenditures\`
         ADD COLUMN \`updated_at\` TIMESTAMP(6)
           NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
           ON UPDATE CURRENT_TIMESTAMP(6),
         ADD COLUMN \`deleted_at\` TIMESTAMP(6) NULL DEFAULT NULL`,
    );
    await queryRunner.query(
      `UPDATE \`campaign_expenditures\`
         SET \`updated_at\` = \`created_at\`
         WHERE \`updated_at\` IS NULL OR \`updated_at\` < \`created_at\``,
    );

    // campaign_saves — already has deleted_at (from 1777900000001).
    await queryRunner.query(
      `ALTER TABLE \`campaign_saves\`
         ADD COLUMN \`updated_at\` TIMESTAMP(6)
           NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
           ON UPDATE CURRENT_TIMESTAMP(6)`,
    );
    await queryRunner.query(
      `UPDATE \`campaign_saves\`
         SET \`updated_at\` = \`created_at\`
         WHERE \`updated_at\` IS NULL OR \`updated_at\` < \`created_at\``,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`campaign_saves\` DROP COLUMN \`updated_at\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`campaign_expenditures\`
         DROP COLUMN \`updated_at\`,
         DROP COLUMN \`deleted_at\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`campaign_amplifiers\`
         DROP COLUMN \`updated_at\`,
         DROP COLUMN \`deleted_at\``,
    );
  }
}
