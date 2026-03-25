import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEventFeature1772390100000 implements MigrationInterface {
  name = 'AddEventFeature1772390100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`event_categories\` (\`id\` varchar(36) NOT NULL, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` timestamp(6) NULL, \`name\` varchar(255) NOT NULL, \`icon\` varchar(255) NULL, \`is_active\` tinyint NOT NULL DEFAULT '1', UNIQUE INDEX \`IDX_category_name\` (\`name\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );

    await queryRunner.query(
      `CREATE TABLE \`events\` (\`id\` varchar(36) NOT NULL, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` timestamp(6) NULL, \`title\` varchar(255) NOT NULL, \`short_description\` varchar(255) NOT NULL, \`detailed_description\` json NOT NULL, \`category_id\` varchar(36) NOT NULL, \`location\` json NOT NULL, \`hashtag\` varchar(30) NOT NULL, \`target_amount\` bigint NOT NULL DEFAULT '0', \`amount_raised\` bigint NOT NULL DEFAULT '0', \`event_time\` timestamp NOT NULL, \`qr_code_link\` varchar(255) NULL, \`items_to_buy\` json NULL, \`expected_participants\` int NOT NULL DEFAULT '0', \`venue_name\` varchar(255) NOT NULL, \`creator_id\` varchar(36) NOT NULL, \`status\` enum('draft', 'active', 'completed', 'cancelled') NOT NULL DEFAULT 'active', PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );

    await queryRunner.query(
      `CREATE TABLE \`event_organizers\` (\`id\` varchar(36) NOT NULL, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` timestamp(6) NULL, \`event_id\` varchar(36) NOT NULL, \`user_id\` varchar(36) NOT NULL, \`role\` enum('owner', 'co-organizer', 'collector') NOT NULL DEFAULT 'co-organizer', PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );

    await queryRunner.query(
      `CREATE TABLE \`event_contributions\` (\`id\` varchar(36) NOT NULL, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` timestamp(6) NULL, \`event_id\` varchar(36) NOT NULL, \`user_id\` varchar(36) NOT NULL, \`type\` enum('donation', 'purchase', 'gifting') NOT NULL, \`amount\` bigint NOT NULL DEFAULT '0', \`details\` json NOT NULL, \`transaction_id\` varchar(36) NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );

    await queryRunner.query(
      `ALTER TABLE \`events\` ADD CONSTRAINT \`FK_event_category\` FOREIGN KEY (\`category_id\`) REFERENCES \`event_categories\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE \`events\` ADD CONSTRAINT \`FK_event_creator\` FOREIGN KEY (\`creator_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE \`event_organizers\` ADD CONSTRAINT \`FK_organizer_event\` FOREIGN KEY (\`event_id\`) REFERENCES \`events\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );

    await queryRunner.query(
      `ALTER TABLE \`event_organizers\` ADD CONSTRAINT \`FK_organizer_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );

    await queryRunner.query(
      `ALTER TABLE \`event_contributions\` ADD CONSTRAINT \`FK_contribution_event\` FOREIGN KEY (\`event_id\`) REFERENCES \`events\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );

    await queryRunner.query(
      `ALTER TABLE \`event_contributions\` ADD CONSTRAINT \`FK_contribution_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE \`event_contributions\` ADD CONSTRAINT \`FK_contribution_transaction\` FOREIGN KEY (\`transaction_id\`) REFERENCES \`transactions\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`event_contributions\` DROP FOREIGN KEY \`FK_contribution_transaction\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`event_contributions\` DROP FOREIGN KEY \`FK_contribution_user\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`event_contributions\` DROP FOREIGN KEY \`FK_contribution_event\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`event_organizers\` DROP FOREIGN KEY \`FK_organizer_user\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`event_organizers\` DROP FOREIGN KEY \`FK_organizer_event\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`events\` DROP FOREIGN KEY \`FK_event_creator\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`events\` DROP FOREIGN KEY \`FK_event_category\``,
    );
    await queryRunner.query(`DROP TABLE \`event_contributions\``);
    await queryRunner.query(`DROP TABLE \`event_organizers\``);
    await queryRunner.query(`DROP TABLE \`events\``);
    await queryRunner.query(`DROP TABLE \`event_categories\``);
  }
}
