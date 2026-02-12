import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateOtpExpirationToTimestamp1770848529246 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` MODIFY \`otp_expiration\` TIMESTAMP NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` MODIFY \`otp_expiration\` DATE NULL`,
    );
  }
}
