import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignEventWithMobile1774432000000 implements MigrationInterface {
  name = 'AlignEventWithMobile1774432000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Rename title to name
    await queryRunner.query(
      `ALTER TABLE \`events\` CHANGE \`title\` \`name\` varchar(255) NOT NULL`,
    );

    // 2. Add title back as nullable (deprecated but kept for compatibility)
    await queryRunner.query(
      `ALTER TABLE \`events\` ADD \`title\` varchar(255) NULL AFTER \`name\``,
    );

    // 3. Add cover_images
    await queryRunner.query(
      `ALTER TABLE \`events\` ADD \`cover_images\` json NULL AFTER \`detailed_description\``,
    );

    // 4. Handle timing changes
    await queryRunner.query(
      `ALTER TABLE \`events\` CHANGE \`event_time\` \`start_date_time\` timestamp NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`events\` ADD \`end_date_time\` timestamp NULL AFTER \`start_date_time\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`events\` ADD \`start_time\` varchar(255) NULL AFTER \`end_date_time\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`events\` ADD \`span_multiple_days\` tinyint NOT NULL DEFAULT '0' AFTER \`start_time\``,
    );

    // 5. Add accept_donations
    await queryRunner.query(
      `ALTER TABLE \`events\` ADD \`accept_donations\` tinyint NOT NULL DEFAULT '1' AFTER \`amount_raised\``,
    );

    // 6. Rename items_to_buy to purchasable_items
    await queryRunner.query(
      `ALTER TABLE \`events\` CHANGE \`items_to_buy\` \`purchasable_items\` json NULL`,
    );

    // 7. Add activities
    await queryRunner.query(
      `ALTER TABLE \`events\` ADD \`activities\` json NULL AFTER \`purchasable_items\``,
    );

    // 8. Add external_organizers
    await queryRunner.query(
      `ALTER TABLE \`events\` ADD \`external_organizers\` json NULL AFTER \`venue_name\``,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`events\` DROP COLUMN \`external_organizers\``,
    );
    await queryRunner.query(`ALTER TABLE \`events\` DROP COLUMN \`activities\``);
    await queryRunner.query(
      `ALTER TABLE \`events\` CHANGE \`purchasable_items\` \`items_to_buy\` json NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`events\` DROP COLUMN \`accept_donations\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`events\` DROP COLUMN \`span_multiple_days\``,
    );
    await queryRunner.query(`ALTER TABLE \`events\` DROP COLUMN \`start_time\``);
    await queryRunner.query(
      `ALTER TABLE \`events\` DROP COLUMN \`end_date_time\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`events\` CHANGE \`start_date_time\` \`event_time\` timestamp NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE \`events\` DROP COLUMN \`cover_images\``);
    await queryRunner.query(`ALTER TABLE \`events\` DROP COLUMN \`title\``);
    await queryRunner.query(
      `ALTER TABLE \`events\` CHANGE \`name\` \`title\` varchar(255) NOT NULL`,
    );
  }
}
