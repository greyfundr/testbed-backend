import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

// Adds an optional `budget_items_json` column on `split_bills` so a
// bill can declare line-item budget entries the same way a campaign
// does. The field is nullable (bills without budget keep working
// exactly as before — propose disbursement falls back to free-form
// amount). Strictly additive, safe on the shared Aiven DB.
export class AddSplitBillBudget1778600000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('split_bills');
    if (!table?.findColumnByName('budget_items_json')) {
      await queryRunner.addColumn(
        'split_bills',
        new TableColumn({
          name: 'budget_items_json',
          type: 'json',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('split_bills');
    if (table?.findColumnByName('budget_items_json')) {
      await queryRunner.dropColumn('split_bills', 'budget_items_json');
    }
  }
}
