import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

// Adds `recurrence_frequency` to split_bills so the creator can pick
// a granular cadence (One-off / Daily / Weekly / Monthly / Yearly)
// instead of just the boolean is_recurring shipped earlier today.
//
// Strictly additive: new enum-string column with default 'ONE_OFF',
// no touch to the existing is_recurring column (kept for backward
// compat and dropped in a later migration once code stops reading it).
export class AddSplitBillRecurrenceFrequency1779500000001
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('split_bills');
    if (!table) return;
    const hasColumn = table.columns.some(
      (c) => c.name === 'recurrence_frequency',
    );
    if (hasColumn) return;
    await queryRunner.addColumn(
      'split_bills',
      new TableColumn({
        name: 'recurrence_frequency',
        type: 'enum',
        enum: ['ONE_OFF', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'],
        default: "'ONE_OFF'",
        isNullable: false,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('split_bills');
    if (!table) return;
    const hasColumn = table.columns.some(
      (c) => c.name === 'recurrence_frequency',
    );
    if (hasColumn) {
      await queryRunner.dropColumn('split_bills', 'recurrence_frequency');
    }
  }
}
