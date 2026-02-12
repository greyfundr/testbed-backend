import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameHasVerifiedEmailToPhone1770849945018 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` RENAME COLUMN \`has_verified_email\` TO \`has_verified_phone\``,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` RENAME COLUMN \`has_verified_phone\` TO \`has_verified_email\``,
    );
  }
}
