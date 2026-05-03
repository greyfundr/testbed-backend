import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSocialFieldsToEventContributions1775600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`event_contributions\`
        ADD COLUMN \`is_anonymous\`          TINYINT(1) DEFAULT 0 AFTER \`type\`,
        ADD COLUMN \`display_name\`          VARCHAR(255) NULL AFTER \`is_anonymous\`,
        ADD COLUMN \`on_behalf_of\`          ENUM('SELF', 'USER', 'EXTERNAL') DEFAULT 'SELF' AFTER \`display_name\`,
        ADD COLUMN \`on_behalf_of_user_id\`  VARCHAR(255) NULL AFTER \`on_behalf_of\`,
        ADD COLUMN \`on_behalf_of_full_name\` VARCHAR(255) NULL AFTER \`on_behalf_of_user_id\`,
        ADD COLUMN \`comment\`               TEXT NULL AFTER \`on_behalf_of_full_name\`,
        ADD COLUMN \`image\`                 VARCHAR(500) NULL AFTER \`comment\`
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`event_contributions\`
        DROP COLUMN \`image\`,
        DROP COLUMN \`comment\`,
        DROP COLUMN \`on_behalf_of_full_name\`,
        DROP COLUMN \`on_behalf_of_user_id\`,
        DROP COLUMN \`on_behalf_of\`,
        DROP COLUMN \`display_name\`,
        DROP COLUMN \`is_anonymous\`
    `);
  }
}
