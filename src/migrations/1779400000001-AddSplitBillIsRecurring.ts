import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

// Adds `is_recurring` to split_bills so the creator can mark a bill
// as a recurring obligation (rent, subscription, etc.) vs a one-off.
// Surfaced as the "Re-occurring" pill on the bill summary card and
// will back future cadence + auto-reset logic.
//
// Strictly additive: nullable boolean with a `false` default so
// every existing row reads as one-off without a backfill pass.
export class AddSplitBillIsRecurring1779400000001
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('split_bills');
    if (!table) return;
    const hasColumn = table.columns.some((c) => c.name === 'is_recurring');
    if (hasColumn) return;
    await queryRunner.addColumn(
      'split_bills',
      new TableColumn({
        name: 'is_recurring',
        type: 'boolean',
        default: false,
        isNullable: false,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('split_bills');
    if (!table) return;
    const hasColumn = table.columns.some((c) => c.name === 'is_recurring');
    if (hasColumn) {
      await queryRunner.dropColumn('split_bills', 'is_recurring');
    }
  }
}
