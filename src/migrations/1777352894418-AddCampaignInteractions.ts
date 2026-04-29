import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class AddCampaignInteractions1777352894418 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Update campaigns status enum
    await queryRunner.query(
      `ALTER TABLE \`campaigns\` MODIFY COLUMN \`status\` enum('pending_approval', 'active', 'rejected', 'completed', 'cancelled', 'expired') NOT NULL DEFAULT 'pending_approval'`,
    );

    // Create campaign_likes table
    await queryRunner.createTable(
      new Table({
        name: 'campaign_likes',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
            isNullable: false,
          },
          {
            name: 'campaign_id',
            type: 'varchar',
            length: '36',
            isNullable: false,
          },
          {
            name: 'user_id',
            type: 'varchar',
            length: '36',
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create campaign_comments table
    await queryRunner.createTable(
      new Table({
        name: 'campaign_comments',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
            isNullable: false,
          },
          {
            name: 'campaign_id',
            type: 'varchar',
            length: '36',
            isNullable: false,
          },
          {
            name: 'user_id',
            type: 'varchar',
            length: '36',
            isNullable: false,
          },
          {
            name: 'content',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Add Foreign Keys for campaign_likes
    await queryRunner.createForeignKeys('campaign_likes', [
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

    // Add Unique Index for likes
    await queryRunner.createIndex(
      'campaign_likes',
      new TableIndex({
        name: 'UQ_campaign_like_user_campaign',
        columnNames: ['campaign_id', 'user_id'],
        isUnique: true,
      }),
    );

    // Add Foreign Keys for campaign_comments
    await queryRunner.createForeignKeys('campaign_comments', [
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('campaign_likes');
    await queryRunner.dropTable('campaign_comments');
    await queryRunner.query(
      `ALTER TABLE \`campaigns\` MODIFY COLUMN \`status\` enum('active', 'completed', 'cancelled', 'expired') NOT NULL DEFAULT 'active'`,
    );
  }
}
