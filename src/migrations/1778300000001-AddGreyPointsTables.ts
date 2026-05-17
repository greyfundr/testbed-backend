import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

// GreyPoints — an admin-tunable points system. `points_rules` holds the
// per-action value (action_code -> points); `user_points_events` is the
// append-only ledger of every award/reversal so totals are reconstructable
// and refunds can claw back precisely. Visibility lives on Settings'
// existing `privacyControls` JSON column — no migration needed there.
//
// Strictly additive. Safe to run on shared Aiven (testbed + prod).
export class AddGreyPointsTables1778300000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.getTable('points_rules'))) {
      await queryRunner.createTable(
        new Table({
          name: 'points_rules',
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            // Canonical key — e.g. `donation.direct`, `donation.via_champion_link`,
            // `donation.split`, `donation.on_behalf.payer`,
            // `donation.on_behalf.beneficiary`. Admin-tunable later.
            {
              name: 'action_code',
              type: 'varchar',
              length: '128',
              isUnique: true,
            },
            { name: 'points', type: 'int', default: 0 },
            // Optional. Non-null means "per kobo of donation amount" — leaves
            // a clean path to switch a rule from flat to amount-scaled later
            // without altering the schema. Stored at kobo precision (the
            // existing money convention on this codebase) for exact math.
            {
              name: 'per_kobo_multiplier',
              type: 'decimal',
              precision: 16,
              scale: 8,
              isNullable: true,
            },
            { name: 'is_active', type: 'tinyint', default: 1 },
            {
              name: 'description',
              type: 'varchar',
              length: '255',
              isNullable: true,
            },
            {
              name: 'created_at',
              type: 'timestamp',
              precision: 6,
              default: 'CURRENT_TIMESTAMP(6)',
            },
            {
              name: 'updated_at',
              type: 'timestamp',
              precision: 6,
              default: 'CURRENT_TIMESTAMP(6)',
              onUpdate: 'CURRENT_TIMESTAMP(6)',
            },
            {
              name: 'deleted_at',
              type: 'timestamp',
              precision: 6,
              isNullable: true,
            },
          ],
        }),
        true,
      );
    }

    if (!(await queryRunner.getTable('user_points_events'))) {
      await queryRunner.createTable(
        new Table({
          name: 'user_points_events',
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'user_id', type: 'varchar', length: '36' },
            { name: 'action_code', type: 'varchar', length: '128' },
            { name: 'points', type: 'int' },
            // Free-text category — `donation`, `split_bill`, `event`, etc.
            // Lets the breakdown endpoint group by section without parsing
            // action_code strings, and lets future surfaces add their own
            // codes without changing this schema.
            {
              name: 'section',
              type: 'varchar',
              length: '64',
            },
            // What concrete row triggered this award. Lets `reverse()`
            // claw back precisely by (source_type, source_ref_id).
            {
              name: 'source_type',
              type: 'varchar',
              length: '64',
              isNullable: true,
            },
            {
              name: 'source_ref_id',
              type: 'varchar',
              length: '36',
              isNullable: true,
            },
            // Free-form JSON for downstream debugging (donation amount,
            // amplifier code, on-behalf split percent, etc.).
            {
              name: 'metadata',
              type: 'json',
              isNullable: true,
            },
            // Set when a refund or cancellation reverses this row. Reads
            // do not delete; they just filter `reversed_at IS NULL`.
            {
              name: 'reversed_at',
              type: 'timestamp',
              precision: 6,
              isNullable: true,
            },
            {
              name: 'reversal_reason',
              type: 'varchar',
              length: '255',
              isNullable: true,
            },
            {
              name: 'created_at',
              type: 'timestamp',
              precision: 6,
              default: 'CURRENT_TIMESTAMP(6)',
            },
            {
              name: 'updated_at',
              type: 'timestamp',
              precision: 6,
              default: 'CURRENT_TIMESTAMP(6)',
              onUpdate: 'CURRENT_TIMESTAMP(6)',
            },
            {
              name: 'deleted_at',
              type: 'timestamp',
              precision: 6,
              isNullable: true,
            },
          ],
        }),
        true,
      );

      await queryRunner.createForeignKey(
        'user_points_events',
        new TableForeignKey({
          columnNames: ['user_id'],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );

      await queryRunner.createIndex(
        'user_points_events',
        new TableIndex({
          name: 'idx_upe_user_active',
          columnNames: ['user_id', 'reversed_at'],
        }),
      );

      await queryRunner.createIndex(
        'user_points_events',
        new TableIndex({
          name: 'idx_upe_source',
          columnNames: ['source_type', 'source_ref_id'],
        }),
      );

      await queryRunner.createIndex(
        'user_points_events',
        new TableIndex({
          name: 'idx_upe_section',
          columnNames: ['section'],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.getTable('user_points_events')) {
      await queryRunner.dropTable('user_points_events');
    }
    if (await queryRunner.getTable('points_rules')) {
      await queryRunner.dropTable('points_rules');
    }
  }
}
