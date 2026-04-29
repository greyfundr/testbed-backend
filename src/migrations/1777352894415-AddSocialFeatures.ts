import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSocialFeatures1777352894415 implements MigrationInterface {
  name = 'AddSocialFeatures1777352894415';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE \`friend_requests\` (
                \`id\` varchar(36) NOT NULL,
                \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                \`deleted_at\` timestamp(6) NULL,
                \`sender_id\` varchar(36) NOT NULL,
                \`receiver_id\` varchar(36) NOT NULL,
                \`status\` enum ('pending', 'accepted', 'rejected') NOT NULL DEFAULT 'pending',
                PRIMARY KEY (\`id\`),
                KEY \`FK_sender_id\` (\`sender_id\`),
                KEY \`FK_receiver_id\` (\`receiver_id\`),
                CONSTRAINT \`FK_friend_request_sender_id\` FOREIGN KEY (\`sender_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
                CONSTRAINT \`FK_friend_request_receiver_id\` FOREIGN KEY (\`receiver_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
            ) ENGINE=InnoDB
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`friend_requests\` DROP FOREIGN KEY \`FK_friend_request_receiver_id\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`friend_requests\` DROP FOREIGN KEY \`FK_friend_request_sender_id\``,
    );
    await queryRunner.query(`DROP TABLE \`friend_requests\``);
  }
}
