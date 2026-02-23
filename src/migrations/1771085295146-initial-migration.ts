import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialMigration1771085295146 implements MigrationInterface {
  name = 'InitialMigration1771085295146';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`settings\` (\`id\` varchar(36) NOT NULL, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` timestamp(6) NULL, \`notificationPrefs\` json NOT NULL, \`privacyControls\` json NOT NULL, \`language\` varchar(255) NOT NULL DEFAULT 'en', \`currency\` varchar(255) NOT NULL DEFAULT 'NGN', \`two_factor_enabled\` tinyint NOT NULL DEFAULT 0, \`two_factor_secret\` varchar(255) NULL, \`email_verified\` tinyint NOT NULL DEFAULT 0, \`phone_verified\` tinyint NOT NULL DEFAULT 0, \`user_id\` varchar(36) NULL, UNIQUE INDEX \`REL_a2883eaa72b3b2e8c98e744609\` (\`user_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`notifications\` (\`id\` varchar(36) NOT NULL, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` timestamp(6) NULL, \`title\` varchar(255) NOT NULL, \`message\` text NOT NULL, \`type\` varchar(255) NULL, \`metadata\` json NULL, \`isRead\` tinyint NOT NULL DEFAULT 0, \`readAt\` datetime NULL, \`user_id\` varchar(36) NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`users\` (\`id\` varchar(36) NOT NULL, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` timestamp(6) NULL, \`email\` varchar(255) NOT NULL, \`phone_number\` varchar(255) NOT NULL, \`password\` varchar(255) NOT NULL, \`first_name\` varchar(255) NULL, \`last_name\` varchar(255) NULL, \`username\` varchar(255) NULL, \`account_type\` varchar(255) NOT NULL, \`email_otp\` varchar(255) NULL, \`phone_otp\` varchar(255) NULL, \`has_verified_phone\` tinyint NOT NULL DEFAULT 0, \`otp_expiration\` timestamp NULL, \`has_submitted_basic_info\` tinyint NOT NULL DEFAULT 0, \`has_completed_kyc\` tinyint NOT NULL DEFAULT 0, \`agree_to_terms\` tinyint NOT NULL DEFAULT 0, \`cac_number\` varchar(255) NULL, \`company_name\` varchar(255) NULL, \`tin\` varchar(255) NULL, \`refresh_token\` varchar(255) NULL, \`pin\` varchar(255) NULL, UNIQUE INDEX \`IDX_97672ac88f789774dd47f7c8be\` (\`email\`), UNIQUE INDEX \`IDX_17d1817f241f10a3dbafb169fd\` (\`phone_number\`), UNIQUE INDEX \`IDX_fe0bb3f6520ee0469504521e71\` (\`username\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`settings\` ADD CONSTRAINT \`FK_a2883eaa72b3b2e8c98e7446098\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`notifications\` ADD CONSTRAINT \`FK_9a8a82462cab47c73d25f49261f\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`notifications\` DROP FOREIGN KEY \`FK_9a8a82462cab47c73d25f49261f\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`settings\` DROP FOREIGN KEY \`FK_a2883eaa72b3b2e8c98e7446098\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_fe0bb3f6520ee0469504521e71\` ON \`users\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_17d1817f241f10a3dbafb169fd\` ON \`users\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_97672ac88f789774dd47f7c8be\` ON \`users\``,
    );
    await queryRunner.query(`DROP TABLE \`users\``);
    await queryRunner.query(`DROP TABLE \`notifications\``);
    await queryRunner.query(
      `DROP INDEX \`REL_a2883eaa72b3b2e8c98e744609\` ON \`settings\``,
    );
    await queryRunner.query(`DROP TABLE \`settings\``);
  }
}
