import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShareLinks1774700000000 implements MigrationInterface {
  name = 'AddShareLinks1774700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`events\`
        ADD COLUMN \`share_link\` varchar(500) NULL AFTER \`is_published\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`split_bills\`
        ADD COLUMN \`share_link\` varchar(500) NULL AFTER \`creator_id\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`campaigns\`
        ADD COLUMN \`share_link\` varchar(500) NULL AFTER \`share_slug\`
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`campaigns\` DROP COLUMN \`share_link\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bills\` DROP COLUMN \`share_link\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`events\` DROP COLUMN \`share_link\``,
    );
  }
}
