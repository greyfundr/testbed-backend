import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddEventDraftFields1774500000000 implements MigrationInterface {
  name = 'AddEventDraftFields1774500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = 'events';

    if (!(await queryRunner.hasColumn(table, 'page_number'))) {
      await queryRunner.addColumn(
        table,
        new TableColumn({
          name: 'page_number',
          type: 'int',
          isNullable: false,
          default: 1,
        }),
      );
    }

    if (!(await queryRunner.hasColumn(table, 'is_approved'))) {
      await queryRunner.addColumn(
        table,
        new TableColumn({
          name: 'is_approved',
          type: 'tinyint',
          isNullable: false,
          default: 0,
        }),
      );
    }

    if (!(await queryRunner.hasColumn(table, 'rejection_reason'))) {
      await queryRunner.addColumn(
        table,
        new TableColumn({
          name: 'rejection_reason',
          type: 'varchar',
          length: '500',
          isNullable: true,
        }),
      );
    }

    if (!(await queryRunner.hasColumn(table, 'visibility_status'))) {
      await queryRunner.addColumn(
        table,
        new TableColumn({
          name: 'visibility_status',
          type: 'enum',
          enum: [
            'private',
            'private_invitation',
            'public',
            'public_registration',
          ],
          default: "'public'",
          isNullable: false,
        }),
      );
    }

    if (!(await queryRunner.hasColumn(table, 'is_published'))) {
      await queryRunner.addColumn(
        table,
        new TableColumn({
          name: 'is_published',
          type: 'tinyint',
          isNullable: false,
          default: 0,
        }),
      );
    }

    try {
      await queryRunner.query(`
        CREATE INDEX \`IDX_events_creator_published\`
        ON \`events\` (\`creator_id\`, \`is_published\`)
      `);
    } catch (error) {
      // Ignore error if index already exists
      if (!error.message.includes('Duplicate key name')) {
        throw error;
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = 'events';

    try {
      await queryRunner.query(
        `DROP INDEX \`IDX_events_creator_published\` ON \`events\``,
      );
    } catch (error) {
      // Ignore if index doesn't exist
    }

    const columnsToDrop = [
      'is_published',
      'visibility_status',
      'rejection_reason',
      'is_approved',
      'page_number',
    ];

    for (const col of columnsToDrop) {
      if (await queryRunner.hasColumn(table, col)) {
        await queryRunner.dropColumn(table, col);
      }
    }
  }
}
