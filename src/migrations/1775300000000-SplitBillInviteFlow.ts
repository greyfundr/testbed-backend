import { MigrationInterface, QueryRunner } from 'typeorm';

export class SplitBillInviteFlow1775300000000 implements MigrationInterface {
  name = 'SplitBillInviteFlow1775300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`users\` 
        ADD COLUMN \`fcm_token\` text NULL
    `);

    await queryRunner.query(
      `ALTER TABLE \`split_bills\` DROP COLUMN \`visibility\``,
    );

    await queryRunner.query(`
      ALTER TABLE \`settings\`
        ADD COLUMN \`allow_split_bill_invites\` tinyint NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`settings\` DROP COLUMN \`allow_split_bill_invites\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`split_bills\`
        ADD COLUMN \`visibility\` varchar(255) NOT NULL DEFAULT 'private'
    `);

    await queryRunner.query(`
      ALTER TABLE \`users\` DROP COLUMN \`fcm_token\`
    `);
  }
}
