import { MigrationInterface, QueryRunner } from 'typeorm';

// Adds the AbstractEntity timestamp columns to three tables whose
// original migrations both (a) used legacy timestamp column names
// (joined_at / posted_at / saved_at) and (b) never added the
// `updated_at` / `deleted_at` columns AbstractEntity expects.
//
// TypeORM SELECTs from these entities throw `Unknown column 'created_at'`
// (or `updated_at`), which surfaces as a blank campaign list.
//
// Strictly additive — no drops, no renames. The legacy timestamp
// columns are left in place; we just mirror their values into a fresh
// `created_at` so AbstractEntity is satisfied. Idempotent: each ADD is
// guarded by an INFORMATION_SCHEMA existence check so it's safe to
// re-run after a partial failure.
export class AddAbstractEntityColsToAmplifiersExpendituresSaves1778100000001
  implements MigrationInterface
{
  private async addColumnIfMissing(
    qr: QueryRunner,
    table: string,
    columnName: string,
    columnDef: string,
  ): Promise<void> {
    const rows = await qr.query(
      `SELECT COUNT(*) AS cnt
         FROM information_schema.columns
         WHERE table_schema = DATABASE()
           AND table_name = ?
           AND column_name = ?`,
      [table, columnName],
    );
    if (Number(rows[0].cnt) > 0) return;
    await qr.query(`ALTER TABLE \`${table}\` ADD COLUMN ${columnDef}`);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tsCol = (name: string, defaultNow = true, onUpdate = false) =>
      `\`${name}\` TIMESTAMP(6) ` +
      (defaultNow ? `NOT NULL DEFAULT CURRENT_TIMESTAMP(6)` : `NULL DEFAULT NULL`) +
      (onUpdate ? ` ON UPDATE CURRENT_TIMESTAMP(6)` : '');

    // campaign_amplifiers — legacy `joined_at`. Needs created_at, updated_at, deleted_at.
    await this.addColumnIfMissing(
      queryRunner,
      'campaign_amplifiers',
      'created_at',
      tsCol('created_at'),
    );
    await this.addColumnIfMissing(
      queryRunner,
      'campaign_amplifiers',
      'updated_at',
      tsCol('updated_at', true, true),
    );
    await this.addColumnIfMissing(
      queryRunner,
      'campaign_amplifiers',
      'deleted_at',
      tsCol('deleted_at', false),
    );
    await queryRunner.query(
      `UPDATE \`campaign_amplifiers\`
         SET \`created_at\` = \`joined_at\`,
             \`updated_at\` = \`joined_at\`
         WHERE \`joined_at\` IS NOT NULL`,
    );

    // campaign_expenditures — legacy `posted_at`. Needs created_at, updated_at, deleted_at.
    await this.addColumnIfMissing(
      queryRunner,
      'campaign_expenditures',
      'created_at',
      tsCol('created_at'),
    );
    await this.addColumnIfMissing(
      queryRunner,
      'campaign_expenditures',
      'updated_at',
      tsCol('updated_at', true, true),
    );
    await this.addColumnIfMissing(
      queryRunner,
      'campaign_expenditures',
      'deleted_at',
      tsCol('deleted_at', false),
    );
    await queryRunner.query(
      `UPDATE \`campaign_expenditures\`
         SET \`created_at\` = \`posted_at\`,
             \`updated_at\` = \`posted_at\`
         WHERE \`posted_at\` IS NOT NULL`,
    );

    // campaign_saves — legacy `saved_at`, already has deleted_at. Needs created_at, updated_at.
    await this.addColumnIfMissing(
      queryRunner,
      'campaign_saves',
      'created_at',
      tsCol('created_at'),
    );
    await this.addColumnIfMissing(
      queryRunner,
      'campaign_saves',
      'updated_at',
      tsCol('updated_at', true, true),
    );
    await queryRunner.query(
      `UPDATE \`campaign_saves\`
         SET \`created_at\` = \`saved_at\`,
             \`updated_at\` = \`saved_at\`
         WHERE \`saved_at\` IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Best-effort drops in case some columns were never created.
    await queryRunner.query(
      `ALTER TABLE \`campaign_saves\`
         DROP COLUMN \`updated_at\`,
         DROP COLUMN \`created_at\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`campaign_expenditures\`
         DROP COLUMN \`deleted_at\`,
         DROP COLUMN \`updated_at\`,
         DROP COLUMN \`created_at\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`campaign_amplifiers\`
         DROP COLUMN \`deleted_at\`,
         DROP COLUMN \`updated_at\`,
         DROP COLUMN \`created_at\``,
    );
  }
}
