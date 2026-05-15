import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateCampaignAmplifiers1777400000003
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'campaign_amplifiers',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'campaign_id', type: 'varchar', length: '36' },
          { name: 'user_id', type: 'varchar', length: '36' },
          { name: 'code', type: 'varchar', length: '20' },
          {
            name: 'joined_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKeys('campaign_amplifiers', [
      new TableForeignKey({
        columnNames: ['campaign_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'campaigns',
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    ]);

    await queryRunner.createIndex(
      'campaign_amplifiers',
      new TableIndex({
        name: 'UQ_campaign_amplifier_code',
        columnNames: ['code'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'campaign_amplifiers',
      new TableIndex({
        name: 'UQ_campaign_amplifier_campaign_user',
        columnNames: ['campaign_id', 'user_id'],
        isUnique: true,
      }),
    );

    // Add referrer FK on donations
    await queryRunner.query(
      `ALTER TABLE \`donations\`
         ADD COLUMN \`referrer_amplifier_id\` VARCHAR(36) NULL`,
    );

    await queryRunner.createForeignKey(
      'donations',
      new TableForeignKey({
        columnNames: ['referrer_amplifier_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'campaign_amplifiers',
        onDelete: 'SET NULL',
      }),
    );

    await queryRunner.createIndex(
      'donations',
      new TableIndex({
        name: 'IDX_donations_referrer_amplifier',
        columnNames: ['referrer_amplifier_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('donations');
    const fk = table?.foreignKeys.find((f) =>
      f.columnNames.includes('referrer_amplifier_id'),
    );
    if (fk) await queryRunner.dropForeignKey('donations', fk);
    await queryRunner.dropIndex(
      'donations',
      'IDX_donations_referrer_amplifier',
    );
    await queryRunner.query(
      `ALTER TABLE \`donations\` DROP COLUMN \`referrer_amplifier_id\``,
    );
    await queryRunner.dropTable('campaign_amplifiers');
  }
}
