import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

// Patch: the original split_bill_organizers + pending_payouts
// migrations forgot to create the `deleted_at` column that the
// shared AbstractEntity declares via @DeleteDateColumn. Every
// SELECT TypeORM runs on those tables adds `WHERE deleted_at IS
// NULL`, so the missing column triggers an "Unknown column"
// error that NestJS converts to 500.
//
// Strictly additive: only adds the missing column on tables where
// it isn't present. Idempotent — re-running is a no-op.
export class BackfillDeletedAtColumns1779200000001
  implements MigrationInterface
{
  private static readonly TABLES = [
    'split_bill_organizers',
    'pending_payouts',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const name of BackfillDeletedAtColumns1779200000001.TABLES) {
      const table = await queryRunner.getTable(name);
      if (!table) continue;
      const hasColumn = table.columns.some((c) => c.name === 'deleted_at');
      if (hasColumn) continue;
      await queryRunner.addColumn(
        name,
        new TableColumn({
          name: 'deleted_at',
          type: 'timestamp',
          precision: 6,
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const name of BackfillDeletedAtColumns1779200000001.TABLES) {
      const table = await queryRunner.getTable(name);
      if (!table) continue;
      const hasColumn = table.columns.some((c) => c.name === 'deleted_at');
      if (hasColumn) {
        await queryRunner.dropColumn(name, 'deleted_at');
      }
    }
  }
}
