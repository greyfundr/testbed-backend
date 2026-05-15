import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateCampaignExpenditures1777400000004
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'campaign_expenditures',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'campaign_id', type: 'varchar', length: '36' },
          { name: 'label', type: 'varchar', length: '255' },
          {
            name: 'amount',
            type: 'decimal',
            precision: 20,
            scale: 2,
            default: 0,
          },
          {
            name: 'budget_ref',
            type: 'varchar',
            length: '64',
            isNullable: true,
          },
          { name: 'receipts', type: 'json', isNullable: true },
          {
            name: 'posted_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          { name: 'posted_by', type: 'varchar', length: '36' },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKeys('campaign_expenditures', [
      new TableForeignKey({
        columnNames: ['campaign_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'campaigns',
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['posted_by'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'RESTRICT',
      }),
    ]);

    await queryRunner.createIndex(
      'campaign_expenditures',
      new TableIndex({
        name: 'IDX_campaign_expenditures_campaign',
        columnNames: ['campaign_id'],
      }),
    );

    await queryRunner.createIndex(
      'campaign_expenditures',
      new TableIndex({
        name: 'IDX_campaign_expenditures_posted_at',
        columnNames: ['posted_at'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('campaign_expenditures');
  }
}
