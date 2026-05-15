import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateCampaignOrganizers1777400000002
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'campaign_organizers',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'campaign_id', type: 'varchar', length: '36' },
          { name: 'user_id', type: 'varchar', length: '36', isNullable: true },
          { name: 'display_name', type: 'varchar', length: '150' },
          { name: 'role', type: 'varchar', length: '200' },
          {
            name: 'avatar_url',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'brand_color',
            type: 'varchar',
            length: '20',
            isNullable: true,
          },
          { name: 'verified', type: 'tinyint', default: 0 },
          { name: 'sort_order', type: 'int', default: 0 },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKeys('campaign_organizers', [
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
        onDelete: 'SET NULL',
      }),
    ]);

    await queryRunner.createIndex(
      'campaign_organizers',
      new TableIndex({
        name: 'IDX_campaign_organizers_campaign',
        columnNames: ['campaign_id'],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'campaign_organizer_follows',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'organizer_id', type: 'varchar', length: '36' },
          { name: 'user_id', type: 'varchar', length: '36' },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKeys('campaign_organizer_follows', [
      new TableForeignKey({
        columnNames: ['organizer_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'campaign_organizers',
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
      'campaign_organizer_follows',
      new TableIndex({
        name: 'UQ_campaign_organizer_follow',
        columnNames: ['organizer_id', 'user_id'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('campaign_organizer_follows');
    await queryRunner.dropTable('campaign_organizers');
  }
}
