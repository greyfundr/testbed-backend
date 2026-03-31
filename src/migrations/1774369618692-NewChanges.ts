import { MigrationInterface, QueryRunner } from 'typeorm';

export class NewChanges1774369618692 implements MigrationInterface {
  name = 'NewChanges1774369618692';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const safeQuery = async (query: string) => {
      try {
        await queryRunner.query(query);
      } catch (error: any) {
        if (
          error.message.includes('check that column/key exists') ||
          error.message.includes("Can't DROP") ||
          error.message.includes('index does not exist') ||
          error.message.includes('Unknown index') ||
          error.message.includes('Duplicate key name') ||
          error.message.includes('Duplicate column name') ||
          error.message.includes('already exists') ||
          error.message.includes('Duplicate entry') ||
          error.message.includes('foreign key constraint fails') ||
          error.message.includes('Cannot delete or update a parent row') ||
          error.message.includes('Cannot drop column') ||
          error.message.includes('Duplicate foreign key')
        ) {
          return;
        }
        throw error;
      }
    };

    await queryRunner.query(`SET FOREIGN_KEY_CHECKS = 0`);
    try {
      await safeQuery(
        `ALTER TABLE \`split_bill_participants\` DROP FOREIGN KEY \`FK_sbp_split_bill\``,
      );
      await safeQuery(
        `ALTER TABLE \`split_bill_participants\` DROP FOREIGN KEY \`FK_sbp_user\``,
      );
      await safeQuery(
        `ALTER TABLE \`split_bill_participants\` DROP FOREIGN KEY \`FK_sbp_wallet\``,
      );
      await safeQuery(
        `ALTER TABLE \`split_bill_activities\` DROP FOREIGN KEY \`FK_sba_split_bill\``,
      );
      await safeQuery(
        `ALTER TABLE \`split_bills\` DROP FOREIGN KEY \`FK_split_bills_creator\``,
      );
      await safeQuery(
        `ALTER TABLE \`events\` DROP FOREIGN KEY \`FK_event_category\``,
      );
      await safeQuery(
        `ALTER TABLE \`events\` DROP FOREIGN KEY \`FK_event_creator\``,
      );
      await safeQuery(
        `ALTER TABLE \`event_organizers\` DROP FOREIGN KEY \`FK_organizer_event\``,
      );
      await safeQuery(
        `ALTER TABLE \`event_organizers\` DROP FOREIGN KEY \`FK_organizer_user\``,
      );
      await safeQuery(
        `ALTER TABLE \`event_contributions\` DROP FOREIGN KEY \`FK_contribution_event\``,
      );
      await safeQuery(
        `ALTER TABLE \`event_contributions\` DROP FOREIGN KEY \`FK_contribution_transaction\``,
      );
      await safeQuery(
        `ALTER TABLE \`event_contributions\` DROP FOREIGN KEY \`FK_contribution_user\``,
      );
      await safeQuery(
        `DROP INDEX \`IDX_users_password_reset_token\` ON \`users\``,
      );
      await safeQuery(
        `DROP INDEX \`IDX_dd85cc865e0c3d5d4be095d3f3\` ON \`transactions\``,
      );
      await safeQuery(
        `DROP INDEX \`IDX_sbp_amount_remaining\` ON \`split_bill_participants\``,
      );
      await safeQuery(
        `DROP INDEX \`IDX_sbp_bill_phone\` ON \`split_bill_participants\``,
      );
      await safeQuery(
        `DROP INDEX \`IDX_sbp_bill_status\` ON \`split_bill_participants\``,
      );
      await safeQuery(
        `DROP INDEX \`IDX_sbp_bill_user\` ON \`split_bill_participants\``,
      );
      await safeQuery(
        `DROP INDEX \`IDX_sbp_deleted_at\` ON \`split_bill_participants\``,
      );
      await safeQuery(
        `DROP INDEX \`IDX_sbp_invite_code\` ON \`split_bill_participants\``,
      );
      await safeQuery(
        `DROP INDEX \`IDX_sbp_user_status\` ON \`split_bill_participants\``,
      );
      await safeQuery(
        `DROP INDEX \`IDX_sba_bill_action_type\` ON \`split_bill_activities\``,
      );
      await safeQuery(
        `DROP INDEX \`IDX_sba_bill_created_at\` ON \`split_bill_activities\``,
      );
      await safeQuery(
        `DROP INDEX \`IDX_sba_participant_id\` ON \`split_bill_activities\``,
      );
      await safeQuery(
        `DROP INDEX \`IDX_sba_transaction_id\` ON \`split_bill_activities\``,
      );
      await safeQuery(
        `DROP INDEX \`IDX_split_bills_creator_status\` ON \`split_bills\``,
      );
      await safeQuery(
        `DROP INDEX \`IDX_split_bills_deleted_at\` ON \`split_bills\``,
      );
      await safeQuery(
        `DROP INDEX \`IDX_split_bills_recipient\` ON \`split_bills\``,
      );
      await safeQuery(
        `DROP INDEX \`IDX_split_bills_source\` ON \`split_bills\``,
      );
      await safeQuery(
        `DROP INDEX \`IDX_split_bills_status_due_date\` ON \`split_bills\``,
      );
      await safeQuery(
        `DROP INDEX \`IDX_category_name\` ON \`event_categories\``,
      );
      await safeQuery(
        `DROP INDEX \`IDX_campaign_categories_deleted_at\` ON \`campaign_categories\``,
      );
      await safeQuery(
        `DROP INDEX \`IDX_campaign_categories_is_active\` ON \`campaign_categories\``,
      );
      await safeQuery(
        `DROP INDEX \`UQ_campaign_categories_name\` ON \`campaign_categories\``,
      );
      await safeQuery(
        `DROP INDEX \`UQ_campaign_categories_slug\` ON \`campaign_categories\``,
      );
      await safeQuery(
        `ALTER TABLE \`campaign_categories\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
      );
      await safeQuery(
        `ALTER TABLE \`users\` MODIFY \`id\` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL`,
      );
      await safeQuery(
        `ALTER TABLE \`wallets\` MODIFY \`id\` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL`,
      );
      await safeQuery(
        `ALTER TABLE \`campaign_categories\` MODIFY \`id\` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL`,
      );
      await safeQuery(
        `ALTER TABLE \`event_categories\` MODIFY \`id\` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL`,
      );
      await safeQuery(
        `ALTER TABLE \`events\` MODIFY \`id\` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL`,
      );
      await safeQuery(
        `ALTER TABLE \`split_bills\` MODIFY \`id\` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE \`users\` CHANGE \`password_reset_token\` \`password_reset_token\` varchar(64) NULL`,
      );
      await safeQuery(
        `ALTER TABLE \`transactions\` DROP FOREIGN KEY \`FK_0b171330be0cb621f8d73b87a9e\``,
      );
      await safeQuery(
        `DROP INDEX \`IDX_e577677a072718d00c47210a2b\` ON \`transactions\``,
      );
      await queryRunner.query(
        `ALTER TABLE \`transactions\` CHANGE \`wallet_id\` \`wallet_id\` varchar(255) NULL`,
      );
      await safeQuery(
        `ALTER TABLE \`transactions\` ADD UNIQUE INDEX \`IDX_dd85cc865e0c3d5d4be095d3f3\` (\`reference\`)`,
      );
      await queryRunner.query(
        `ALTER TABLE \`split_bill_participants\` CHANGE \`created_at\` \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`,
      );
      await queryRunner.query(
        `ALTER TABLE \`split_bill_participants\` CHANGE \`updated_at\` \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)`,
      );
      await queryRunner.query(
        `ALTER TABLE \`split_bill_participants\` CHANGE \`deleted_at\` \`deleted_at\` timestamp(6) NULL`,
      );
      await safeQuery(
        `ALTER TABLE \`split_bill_participants\` MODIFY \`split_bill_id\` varchar(36) NOT NULL`,
      );
      await safeQuery(
        `ALTER TABLE \`split_bill_participants\` MODIFY \`user_id\` varchar(36) NULL`,
      );
      await safeQuery(
        `ALTER TABLE \`split_bill_participants\` MODIFY \`role\` varchar(255) NOT NULL DEFAULT 'participant'`,
      );
      await queryRunner.query(
        `ALTER TABLE \`split_bill_participants\` CHANGE \`balance_adjustment\` \`balance_adjustment\` bigint NOT NULL DEFAULT '0'`,
      );
      await queryRunner.query(
        `ALTER TABLE \`split_bill_participants\` CHANGE \`percentage\` \`percentage\` int NULL`,
      );
      await safeQuery(
        `ALTER TABLE \`split_bill_participants\` MODIFY \`status\` varchar(255) NOT NULL DEFAULT 'invited'`,
      );
      await safeQuery(
        `ALTER TABLE \`split_bill_participants\` ADD UNIQUE INDEX \`IDX_8e4d22724525e9d1fb77872055\` (\`invite_code\`)`,
      );
      await queryRunner.query(
        `ALTER TABLE \`split_bill_participants\` CHANGE \`payment_link\` \`payment_link\` varchar(500) NULL`,
      );
      await safeQuery(
        `ALTER TABLE \`split_bill_participants\` MODIFY \`wallet_id\` varchar(36) NULL`,
      );
      await safeQuery(
        `ALTER TABLE \`split_bill_participants\` MODIFY \`payment_method\` varchar(255) NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE \`split_bill_activities\` CHANGE \`created_at\` \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`,
      );
      await queryRunner.query(
        `ALTER TABLE \`split_bill_activities\` CHANGE \`updated_at\` \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)`,
      );
      await queryRunner.query(
        `ALTER TABLE \`split_bill_activities\` CHANGE \`deleted_at\` \`deleted_at\` timestamp(6) NULL`,
      );
      await safeQuery(
        `ALTER TABLE \`split_bill_activities\` MODIFY \`split_bill_id\` varchar(36) NOT NULL`,
      );
      await safeQuery(
        `ALTER TABLE \`split_bill_activities\` MODIFY \`actor_id\` varchar(36) NULL`,
      );
      await safeQuery(
        `ALTER TABLE \`split_bill_activities\` MODIFY \`participant_id\` varchar(36) NULL`,
      );
      await safeQuery(
        `ALTER TABLE \`split_bill_activities\` MODIFY \`action_type\` varchar(255) NOT NULL`,
      );
      await safeQuery(
        `ALTER TABLE \`split_bill_activities\` MODIFY \`bill_status_at_time\` varchar(255) NULL`,
      );
      await safeQuery(
        `ALTER TABLE \`split_bill_activities\` MODIFY \`transaction_id\` varchar(36) NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE \`split_bills\` CHANGE \`created_at\` \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`,
      );
      await queryRunner.query(
        `ALTER TABLE \`split_bills\` CHANGE \`updated_at\` \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)`,
      );
      await queryRunner.query(
        `ALTER TABLE \`split_bills\` CHANGE \`deleted_at\` \`deleted_at\` timestamp(6) NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE \`split_bills\` CHANGE \`total_amount\` \`total_amount\` bigint NOT NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE \`split_bills\` CHANGE \`total_collected\` \`total_collected\` bigint NOT NULL DEFAULT '0'`,
      );
      await safeQuery(
        `ALTER TABLE \`split_bills\` MODIFY \`split_method\` varchar(255) NOT NULL DEFAULT 'EVEN'`,
      );
      await queryRunner.query(
        `ALTER TABLE \`split_bills\` CHANGE \`is_finalized\` \`is_finalized\` tinyint NOT NULL DEFAULT 0`,
      );
      await queryRunner.query(
        `ALTER TABLE \`split_bills\` CHANGE \`min_payment_amount\` \`min_payment_amount\` bigint NULL`,
      );
      await safeQuery(
        `ALTER TABLE \`split_bills\` MODIFY \`status\` varchar(255) NOT NULL DEFAULT 'draft'`,
      );
      await safeQuery(
        `ALTER TABLE \`split_bills\` MODIFY \`recipient_user_id\` varchar(36) NULL`,
      );
      await safeQuery(
        `ALTER TABLE \`split_bills\` MODIFY \`source_bill_type\` varchar(255) NULL`,
      );
      await safeQuery(
        `ALTER TABLE \`split_bills\` MODIFY \`source_bill_id\` varchar(36) NULL`,
      );
      await safeQuery(
        `ALTER TABLE \`split_bills\` MODIFY \`visibility\` varchar(255) NOT NULL DEFAULT 'private'`,
      );
      await queryRunner.query(
        `ALTER TABLE \`split_bills\` CHANGE \`reminder_days_before\` \`reminder_days_before\` int NULL`,
      );
      await safeQuery(
        `ALTER TABLE \`split_bills\` MODIFY \`creator_id\` varchar(36) NOT NULL`,
      );
      await safeQuery(
        `ALTER TABLE \`event_categories\` ADD UNIQUE INDEX \`IDX_16952bc5124b9961178b997290\` (\`name\`)`,
      );
      await safeQuery(
        `ALTER TABLE \`events\` MODIFY \`category_id\` varchar(36) NOT NULL`,
      );
      await safeQuery(
        `ALTER TABLE \`events\` MODIFY \`creator_id\` varchar(36) NOT NULL`,
      );
      await safeQuery(
        `ALTER TABLE \`event_organizers\` MODIFY \`event_id\` varchar(36) NOT NULL`,
      );
      await safeQuery(
        `ALTER TABLE \`event_organizers\` MODIFY \`user_id\` varchar(36) NOT NULL`,
      );
      await safeQuery(
        `ALTER TABLE \`event_contributions\` MODIFY \`event_id\` varchar(36) NOT NULL`,
      );
      await safeQuery(
        `ALTER TABLE \`event_contributions\` MODIFY \`user_id\` varchar(36) NOT NULL`,
      );
      await safeQuery(
        `ALTER TABLE \`event_contributions\` MODIFY \`transaction_id\` varchar(36) NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE \`campaign_categories\` CHANGE \`created_at\` \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`,
      );
      await queryRunner.query(
        `ALTER TABLE \`campaign_categories\` CHANGE \`updated_at\` \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)`,
      );
      await queryRunner.query(
        `ALTER TABLE \`campaign_categories\` CHANGE \`deleted_at\` \`deleted_at\` timestamp(6) NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE \`campaign_categories\` CHANGE \`name\` \`name\` varchar(100) NOT NULL`,
      );
      await safeQuery(
        `ALTER TABLE \`campaign_categories\` ADD UNIQUE INDEX \`IDX_e729d3b0e66ca5a9735f9975cc\` (\`name\`)`,
      );
      await queryRunner.query(
        `ALTER TABLE \`campaign_categories\` CHANGE \`slug\` \`slug\` varchar(100) NOT NULL`,
      );
      await safeQuery(
        `ALTER TABLE \`campaign_categories\` ADD UNIQUE INDEX \`IDX_99e3b1880e21df21ba8f11a8c5\` (\`slug\`)`,
      );
      await safeQuery(
        `ALTER TABLE \`campaigns\` MODIFY \`category_id\` varchar(36) NOT NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE \`campaigns\` CHANGE \`budget\` \`budget\` json NOT NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE \`campaigns\` CHANGE \`share_slug\` \`share_slug\` varchar(21) NOT NULL`,
      );
      // Fill empty share_slugs with unique values based on ID to avoid duplicate entry errors
      await queryRunner.query(
        `UPDATE \`campaigns\` SET \`share_slug\` = SUBSTRING(REPLACE(id, '-', ''), 1, 21) WHERE \`share_slug\` = '' OR \`share_slug\` IS NULL`,
      );
      await safeQuery(
        `ALTER TABLE \`campaigns\` ADD UNIQUE INDEX \`IDX_15ec556e5d55e8b22fdfe31b2f\` (\`share_slug\`)`,
      );
      await safeQuery(
        `CREATE INDEX \`IDX_e577677a072718d00c47210a2b\` ON \`transactions\` (\`wallet_id\`, \`created_at\`)`,
      );
      await safeQuery(
        `CREATE INDEX \`IDX_4cf551fb290d03ef40c0f56886\` ON \`split_bill_participants\` (\`split_bill_id\`)`,
      );
      await safeQuery(
        `CREATE INDEX \`IDX_c4aef859c8ffccb33fbebeae75\` ON \`split_bill_participants\` (\`user_id\`)`,
      );
      await safeQuery(
        `CREATE INDEX \`IDX_f689903ff7dac3cf29bc3c90d2\` ON \`split_bill_participants\` (\`guest_phone\`)`,
      );
      await safeQuery(
        `CREATE INDEX \`IDX_28df32ac4b5de9945f96b75e1b\` ON \`split_bill_participants\` (\`user_id\`, \`status\`)`,
      );
      await safeQuery(
        `CREATE INDEX \`IDX_3de8f4aa276bc433876212c2fc\` ON \`split_bill_participants\` (\`split_bill_id\`, \`status\`)`,
      );
      // Cleanup duplicate split_bill_participants to avoid duplicate entry errors
      await queryRunner.query(`DELETE p1 FROM \`split_bill_participants\` p1 
            INNER JOIN \`split_bill_participants\` p2 
            WHERE p1.id < p2.id 
            AND p1.split_bill_id = p2.split_bill_id 
            AND (
                (p1.guest_phone IS NOT NULL AND p1.guest_phone = p2.guest_phone) 
                OR (p1.user_id IS NOT NULL AND p1.user_id = p2.user_id)
            )`);
      await safeQuery(
        `CREATE UNIQUE INDEX \`IDX_12f3c952d38734779a98b6c8a0\` ON \`split_bill_participants\` (\`split_bill_id\`, \`guest_phone\`)`,
      );
      await safeQuery(
        `CREATE UNIQUE INDEX \`IDX_f56af844f2f1a99915128960f8\` ON \`split_bill_participants\` (\`split_bill_id\`, \`user_id\`)`,
      );
      await safeQuery(
        `CREATE INDEX \`IDX_035e92052844880935268d136d\` ON \`split_bill_activities\` (\`split_bill_id\`)`,
      );
      await safeQuery(
        `CREATE INDEX \`IDX_e349abaf80af799e4085e5f6f5\` ON \`split_bill_activities\` (\`action_type\`)`,
      );
      await safeQuery(
        `CREATE INDEX \`IDX_146c9333f6bec1d63631b3ff8d\` ON \`split_bill_activities\` (\`participant_id\`)`,
      );
      await safeQuery(
        `CREATE INDEX \`IDX_60d56e7239b9334a2c26d71fc7\` ON \`split_bill_activities\` (\`actor_id\`)`,
      );
      await safeQuery(
        `CREATE INDEX \`IDX_1dba5138418eda47136079f498\` ON \`split_bill_activities\` (\`split_bill_id\`, \`created_at\`)`,
      );
      await safeQuery(
        `CREATE INDEX \`IDX_7d311bc5ce4205f99d62d0cbc2\` ON \`split_bills\` (\`creator_id\`)`,
      );
      await safeQuery(
        `CREATE INDEX \`IDX_16e3462e30099230e8842dbb7a\` ON \`split_bills\` (\`source_bill_type\`, \`source_bill_id\`)`,
      );
      await safeQuery(
        `CREATE INDEX \`IDX_ddab841a32122abad1bbaa5a4c\` ON \`split_bills\` (\`status\`, \`due_date\`)`,
      );
      await safeQuery(
        `CREATE INDEX \`IDX_21e54ad2451a427435b8600ebd\` ON \`split_bills\` (\`creator_id\`, \`status\`)`,
      );

      // Cleanup orphaned rows before adding foreign keys
      await safeQuery(
        `DELETE FROM \`split_bill_participants\` WHERE \`split_bill_id\` NOT IN (SELECT id FROM \`split_bills\`)`,
      );
      await safeQuery(
        `DELETE FROM \`split_bill_activities\` WHERE \`split_bill_id\` NOT IN (SELECT id FROM \`split_bills\`)`,
      );
      await safeQuery(
        `DELETE FROM \`events\` WHERE \`category_id\` NOT IN (SELECT id FROM \`event_categories\`)`,
      );
      await safeQuery(
        `DELETE FROM \`event_contributions\` WHERE \`event_id\` NOT IN (SELECT id FROM \`events\`)`,
      );

      await safeQuery(
        `ALTER TABLE \`transactions\` ADD CONSTRAINT \`FK_0b171330be0cb621f8d73b87a9e\` FOREIGN KEY (\`wallet_id\`) REFERENCES \`wallets\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
      );
      await safeQuery(
        `ALTER TABLE \`split_bill_participants\` ADD CONSTRAINT \`FK_4cf551fb290d03ef40c0f568864\` FOREIGN KEY (\`split_bill_id\`) REFERENCES \`split_bills\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
      );
      await safeQuery(
        `ALTER TABLE \`split_bill_participants\` ADD CONSTRAINT \`FK_c4aef859c8ffccb33fbebeae75b\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
      );
      await safeQuery(
        `ALTER TABLE \`split_bill_participants\` ADD CONSTRAINT \`FK_b990337ca0eb7861f153eb497ca\` FOREIGN KEY (\`wallet_id\`) REFERENCES \`wallets\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
      );
      await safeQuery(
        `ALTER TABLE \`split_bill_activities\` ADD CONSTRAINT \`FK_035e92052844880935268d136d6\` FOREIGN KEY (\`split_bill_id\`) REFERENCES \`split_bills\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
      );
      await safeQuery(
        `ALTER TABLE \`split_bills\` ADD CONSTRAINT \`FK_7d311bc5ce4205f99d62d0cbc28\` FOREIGN KEY (\`creator_id\`) REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
      );
      await safeQuery(
        `ALTER TABLE \`events\` ADD CONSTRAINT \`FK_643188b30e049632f80367be4e1\` FOREIGN KEY (\`category_id\`) REFERENCES \`event_categories\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
      );
      await safeQuery(
        `ALTER TABLE \`events\` ADD CONSTRAINT \`FK_39f98b48445861611ea17108071\` FOREIGN KEY (\`creator_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
      );
      await safeQuery(
        `ALTER TABLE \`event_organizers\` ADD CONSTRAINT \`FK_64b592355e149a4d47def2412d5\` FOREIGN KEY (\`event_id\`) REFERENCES \`events\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
      );
      await safeQuery(
        `ALTER TABLE \`event_organizers\` ADD CONSTRAINT \`FK_1dd4c4652b67727b9f1f5453425\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
      );
      await safeQuery(
        `ALTER TABLE \`event_contributions\` ADD CONSTRAINT \`FK_e18b5b90ce821b27235c3f5a7e7\` FOREIGN KEY (\`event_id\`) REFERENCES \`events\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
      );
      await safeQuery(
        `ALTER TABLE \`event_contributions\` ADD CONSTRAINT \`FK_20bbcf43069cc1c8020823a5319\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
      );
      await safeQuery(
        `ALTER TABLE \`event_contributions\` ADD CONSTRAINT \`FK_062027d239c0fb80d9fb6441284\` FOREIGN KEY (\`transaction_id\`) REFERENCES \`transactions\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
      );
      await safeQuery(
        `ALTER TABLE \`campaigns\` ADD CONSTRAINT \`FK_05e02ff530b163f0b8ebe409ab4\` FOREIGN KEY (\`category_id\`) REFERENCES \`campaign_categories\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
      );
    } finally {
      await queryRunner.query(`SET FOREIGN_KEY_CHECKS = 1`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`campaigns\` DROP FOREIGN KEY \`FK_05e02ff530b163f0b8ebe409ab4\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`event_contributions\` DROP FOREIGN KEY \`FK_062027d239c0fb80d9fb6441284\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`event_contributions\` DROP FOREIGN KEY \`FK_20bbcf43069cc1c8020823a5319\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`event_contributions\` DROP FOREIGN KEY \`FK_e18b5b90ce821b27235c3f5a7e7\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`event_organizers\` DROP FOREIGN KEY \`FK_1dd4c4652b67727b9f1f5453425\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`event_organizers\` DROP FOREIGN KEY \`FK_64b592355e149a4d47def2412d5\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`events\` DROP FOREIGN KEY \`FK_39f98b48445861611ea17108071\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`events\` DROP FOREIGN KEY \`FK_643188b30e049632f80367be4e1\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bills\` DROP FOREIGN KEY \`FK_7d311bc5ce4205f99d62d0cbc28\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_activities\` DROP FOREIGN KEY \`FK_035e92052844880935268d136d6\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_participants\` DROP FOREIGN KEY \`FK_b990337ca0eb7861f153eb497ca\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_participants\` DROP FOREIGN KEY \`FK_c4aef859c8ffccb33fbebeae75b\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_participants\` DROP FOREIGN KEY \`FK_4cf551fb290d03ef40c0f568864\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`transactions\` DROP FOREIGN KEY \`FK_0b171330be0cb621f8d73b87a9e\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_21e54ad2451a427435b8600ebd\` ON \`split_bills\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_ddab841a32122abad1bbaa5a4c\` ON \`split_bills\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_16e3462e30099230e8842dbb7a\` ON \`split_bills\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_7d311bc5ce4205f99d62d0cbc2\` ON \`split_bills\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_1dba5138418eda47136079f498\` ON \`split_bill_activities\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_60d56e7239b9334a2c26d71fc7\` ON \`split_bill_activities\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_146c9333f6bec1d63631b3ff8d\` ON \`split_bill_activities\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_e349abaf80af799e4085e5f6f5\` ON \`split_bill_activities\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_035e92052844880935268d136d\` ON \`split_bill_activities\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_f56af844f2f1a99915128960f8\` ON \`split_bill_participants\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_12f3c952d38734779a98b6c8a0\` ON \`split_bill_participants\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_3de8f4aa276bc433876212c2fc\` ON \`split_bill_participants\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_28df32ac4b5de9945f96b75e1b\` ON \`split_bill_participants\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_f689903ff7dac3cf29bc3c90d2\` ON \`split_bill_participants\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_c4aef859c8ffccb33fbebeae75\` ON \`split_bill_participants\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_4cf551fb290d03ef40c0f56886\` ON \`split_bill_participants\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_e577677a072718d00c47210a2b\` ON \`transactions\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`campaigns\` DROP INDEX \`IDX_15ec556e5d55e8b22fdfe31b2f\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`campaigns\` CHANGE \`share_slug\` \`share_slug\` varchar(21) NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE \`campaigns\` CHANGE \`budget\` \`budget\` json NOT NULL DEFAULT 'json_array()'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`campaigns\` DROP COLUMN \`category_id\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`campaigns\` ADD \`category_id\` varchar(36) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`campaign_categories\` DROP INDEX \`IDX_99e3b1880e21df21ba8f11a8c5\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`campaign_categories\` CHANGE \`slug\` \`slug\` varchar(100) COLLATE "utf8mb4_unicode_ci" NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`campaign_categories\` DROP INDEX \`IDX_e729d3b0e66ca5a9735f9975cc\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`campaign_categories\` CHANGE \`name\` \`name\` varchar(100) COLLATE "utf8mb4_unicode_ci" NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`campaign_categories\` CHANGE \`deleted_at\` \`deleted_at\` timestamp(0) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`campaign_categories\` CHANGE \`updated_at\` \`updated_at\` timestamp(0) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE \`campaign_categories\` CHANGE \`created_at\` \`created_at\` timestamp(0) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE \`event_contributions\` DROP COLUMN \`transaction_id\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`event_contributions\` ADD \`transaction_id\` varchar(36) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`event_contributions\` DROP COLUMN \`user_id\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`event_contributions\` ADD \`user_id\` varchar(36) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`event_contributions\` DROP COLUMN \`event_id\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`event_contributions\` ADD \`event_id\` varchar(36) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`event_organizers\` DROP COLUMN \`user_id\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`event_organizers\` ADD \`user_id\` varchar(36) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`event_organizers\` DROP COLUMN \`event_id\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`event_organizers\` ADD \`event_id\` varchar(36) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`events\` DROP COLUMN \`creator_id\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`events\` ADD \`creator_id\` varchar(36) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`events\` DROP COLUMN \`category_id\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`events\` ADD \`category_id\` varchar(36) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`event_categories\` DROP INDEX \`IDX_16952bc5124b9961178b997290\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bills\` DROP COLUMN \`creator_id\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bills\` ADD \`creator_id\` varchar(36) NOT NULL COMMENT 'FK → users.id'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bills\` CHANGE \`reminder_days_before\` \`reminder_days_before\` int NULL COMMENT 'Auto-reminder N days before due_date. Null = manual reminders only.'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bills\` DROP COLUMN \`visibility\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bills\` ADD \`visibility\` varchar(20) NOT NULL COMMENT 'public | private | semi_private' DEFAULT 'private'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bills\` DROP COLUMN \`source_bill_id\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bills\` ADD \`source_bill_id\` varchar(36) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bills\` DROP COLUMN \`source_bill_type\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bills\` ADD \`source_bill_type\` varchar(20) NULL COMMENT 'invoice | campaign | request | manual'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bills\` DROP COLUMN \`recipient_user_id\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bills\` ADD \`recipient_user_id\` varchar(36) NULL COMMENT 'The GreyFundr user who receives settled funds. Usually the creator.'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bills\` DROP COLUMN \`status\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bills\` ADD \`status\` varchar(30) NOT NULL COMMENT 'draft | active | partially_paid | funded | settled | cancelled | disputed' DEFAULT 'draft'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bills\` CHANGE \`min_payment_amount\` \`min_payment_amount\` bigint NULL COMMENT 'Minimum single payment in kobo. Guards against micro-payment spam.'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bills\` CHANGE \`is_finalized\` \`is_finalized\` tinyint NOT NULL COMMENT 'Once true, no further participant or amount changes are allowed.' DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bills\` DROP COLUMN \`split_method\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bills\` ADD \`split_method\` varchar(20) NOT NULL COMMENT 'EVEN | MANUAL | PERCENTAGE' DEFAULT 'EVEN'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bills\` CHANGE \`total_collected\` \`total_collected\` bigint NOT NULL COMMENT 'Running total collected from all participants (kobo). Updated atomically on each payment.' DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bills\` CHANGE \`total_amount\` \`total_amount\` bigint NOT NULL COMMENT 'Total bill amount in kobo. SUM(participants.amount_owed) must equal this.'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bills\` CHANGE \`deleted_at\` \`deleted_at\` timestamp(0) NULL COMMENT 'Soft delete. NULL = active record.'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bills\` CHANGE \`updated_at\` \`updated_at\` timestamp(0) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bills\` CHANGE \`created_at\` \`created_at\` timestamp(0) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_activities\` DROP COLUMN \`transaction_id\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_activities\` ADD \`transaction_id\` varchar(36) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_activities\` DROP COLUMN \`bill_status_at_time\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_activities\` ADD \`bill_status_at_time\` varchar(30) NULL COMMENT 'Snapshot of bill status when this event was recorded.'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_activities\` DROP COLUMN \`action_type\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_activities\` ADD \`action_type\` varchar(50) NOT NULL COMMENT 'created | updated | cancelled | bill_funded | bill_finalized | payment_made | participant_added | participant_removed | participant_accepted | participant_declined | reminder_sent | settled | disputed'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_activities\` DROP COLUMN \`participant_id\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_activities\` ADD \`participant_id\` varchar(36) NULL COMMENT 'Set when the event concerns a specific participant.'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_activities\` DROP COLUMN \`actor_id\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_activities\` ADD \`actor_id\` varchar(36) NULL COMMENT 'User who triggered the action. NULL for system-generated events.'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_activities\` DROP COLUMN \`split_bill_id\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_activities\` ADD \`split_bill_id\` varchar(36) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_activities\` CHANGE \`deleted_at\` \`deleted_at\` timestamp(0) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_activities\` CHANGE \`updated_at\` \`updated_at\` timestamp(0) NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_activities\` CHANGE \`created_at\` \`created_at\` timestamp(0) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_participants\` DROP COLUMN \`payment_method\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_participants\` ADD \`payment_method\` varchar(20) NULL COMMENT 'wallet | card | bank_transfer'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_participants\` DROP COLUMN \`wallet_id\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_participants\` ADD \`wallet_id\` varchar(36) NULL COMMENT 'Wallet used for payment. NULL for guests.'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_participants\` CHANGE \`payment_link\` \`payment_link\` varchar(500) NULL COMMENT 'Short-lived Paystack payment link for guest participants.'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_participants\` DROP INDEX \`IDX_8e4d22724525e9d1fb77872055\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_participants\` DROP COLUMN \`status\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_participants\` ADD \`status\` varchar(20) NOT NULL COMMENT 'INVITED | ACCEPTED | DECLINED | UNPAID | PARTIAL | PAID | WAIVED' DEFAULT 'INVITED'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_participants\` CHANGE \`percentage\` \`percentage\` int NULL COMMENT 'Used only when split_method = PERCENTAGE. Whole number 0-100.'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_participants\` CHANGE \`balance_adjustment\` \`balance_adjustment\` bigint NOT NULL COMMENT 'Creator-applied kobo adjustment. Negative = discount; positive = surcharge.' DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_participants\` DROP COLUMN \`role\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_participants\` ADD \`role\` varchar(20) NOT NULL COMMENT 'creator | participant | recipient' DEFAULT 'participant'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_participants\` DROP COLUMN \`user_id\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_participants\` ADD \`user_id\` varchar(36) NULL COMMENT 'NULL for guest participants.'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_participants\` DROP COLUMN \`split_bill_id\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_participants\` ADD \`split_bill_id\` varchar(36) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_participants\` CHANGE \`deleted_at\` \`deleted_at\` timestamp(0) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_participants\` CHANGE \`updated_at\` \`updated_at\` timestamp(0) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_participants\` CHANGE \`created_at\` \`created_at\` timestamp(0) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE \`transactions\` DROP INDEX \`IDX_dd85cc865e0c3d5d4be095d3f3\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`transactions\` CHANGE \`wallet_id\` \`wallet_id\` varchar(255) NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_e577677a072718d00c47210a2b\` ON \`transactions\` (\`wallet_id\`, \`created_at\`)`,
    );
    await queryRunner.query(
      `ALTER TABLE \`transactions\` ADD CONSTRAINT \`FK_0b171330be0cb621f8d73b87a9e\` FOREIGN KEY (\`wallet_id\`) REFERENCES \`wallets\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` CHANGE \`password_reset_token\` \`password_reset_token\` varchar(64) NULL COMMENT 'SHA-256 hash of raw reset token issued after OTP verification'`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`UQ_campaign_categories_slug\` ON \`campaign_categories\` (\`slug\`)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`UQ_campaign_categories_name\` ON \`campaign_categories\` (\`name\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_campaign_categories_is_active\` ON \`campaign_categories\` (\`is_active\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_campaign_categories_deleted_at\` ON \`campaign_categories\` (\`deleted_at\`)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`IDX_category_name\` ON \`event_categories\` (\`name\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_split_bills_status_due_date\` ON \`split_bills\` (\`status\`, \`due_date\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_split_bills_source\` ON \`split_bills\` (\`source_bill_type\`, \`source_bill_id\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_split_bills_recipient\` ON \`split_bills\` (\`recipient_user_id\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_split_bills_deleted_at\` ON \`split_bills\` (\`deleted_at\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_split_bills_creator_status\` ON \`split_bills\` (\`creator_id\`, \`status\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_sba_transaction_id\` ON \`split_bill_activities\` (\`transaction_id\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_sba_participant_id\` ON \`split_bill_activities\` (\`participant_id\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_sba_bill_created_at\` ON \`split_bill_activities\` (\`split_bill_id\`, \`created_at\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_sba_bill_action_type\` ON \`split_bill_activities\` (\`split_bill_id\`, \`action_type\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_sbp_user_status\` ON \`split_bill_participants\` (\`user_id\`, \`status\`)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`IDX_sbp_invite_code\` ON \`split_bill_participants\` (\`invite_code\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_sbp_deleted_at\` ON \`split_bill_participants\` (\`deleted_at\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_sbp_bill_user\` ON \`split_bill_participants\` (\`split_bill_id\`, \`user_id\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_sbp_bill_status\` ON \`split_bill_participants\` (\`split_bill_id\`, \`status\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_sbp_bill_phone\` ON \`split_bill_participants\` (\`split_bill_id\`, \`guest_phone\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_sbp_amount_remaining\` ON \`split_bill_participants\` (\`amount_remaining\`)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`IDX_dd85cc865e0c3d5d4be095d3f3\` ON \`transactions\` (\`reference\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_users_password_reset_token\` ON \`users\` (\`password_reset_token\`)`,
    );
    await queryRunner.query(
      `ALTER TABLE \`event_contributions\` ADD CONSTRAINT \`FK_contribution_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`event_contributions\` ADD CONSTRAINT \`FK_contribution_transaction\` FOREIGN KEY (\`transaction_id\`) REFERENCES \`transactions\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`event_contributions\` ADD CONSTRAINT \`FK_contribution_event\` FOREIGN KEY (\`event_id\`) REFERENCES \`events\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE \`event_organizers\` ADD CONSTRAINT \`FK_organizer_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE \`event_organizers\` ADD CONSTRAINT \`FK_organizer_event\` FOREIGN KEY (\`event_id\`) REFERENCES \`events\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE \`events\` ADD CONSTRAINT \`FK_event_creator\` FOREIGN KEY (\`creator_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`events\` ADD CONSTRAINT \`FK_event_category\` FOREIGN KEY (\`category_id\`) REFERENCES \`event_categories\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bills\` ADD CONSTRAINT \`FK_split_bills_creator\` FOREIGN KEY (\`creator_id\`) REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_activities\` ADD CONSTRAINT \`FK_sba_split_bill\` FOREIGN KEY (\`split_bill_id\`) REFERENCES \`split_bills\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_participants\` ADD CONSTRAINT \`FK_sbp_wallet\` FOREIGN KEY (\`wallet_id\`) REFERENCES \`wallets\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_participants\` ADD CONSTRAINT \`FK_sbp_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_participants\` ADD CONSTRAINT \`FK_sbp_split_bill\` FOREIGN KEY (\`split_bill_id\`) REFERENCES \`split_bills\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }
}
