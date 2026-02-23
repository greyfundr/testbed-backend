import { MigrationInterface, QueryRunner } from 'typeorm';

export class CampaignsAndDonations1771858724279 implements MigrationInterface {
  name = 'CampaignsAndDonations1771858724279';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`campaigns\` (\`id\` varchar(36) NOT NULL, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` timestamp(6) NULL, \`title\` varchar(255) NOT NULL, \`description\` text NOT NULL, \`category\` varchar(255) NOT NULL, \`offers\` json NOT NULL, \`target\` bigint NOT NULL DEFAULT '0', \`current_amount\` bigint NOT NULL DEFAULT '0', \`start_date\` timestamp NOT NULL, \`end_date\` timestamp NOT NULL, \`images\` json NOT NULL, \`fee\` bigint NOT NULL DEFAULT '0', \`status\` enum ('active', 'completed', 'cancelled', 'expired') NOT NULL DEFAULT 'active', \`creator_id\` varchar(255) NOT NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`donations\` (\`id\` varchar(36) NOT NULL, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` timestamp(6) NULL, \`amount\` bigint NOT NULL DEFAULT '0', \`donor_id\` varchar(255) NOT NULL, \`campaign_id\` varchar(255) NOT NULL, \`transaction_id\` varchar(255) NULL, \`is_anonymous\` tinyint NOT NULL DEFAULT '0', \`custom_username\` varchar(255) NULL, \`on_behalf_of\` enum ('self', 'user', 'external') NOT NULL DEFAULT 'self', \`on_behalf_of_user_id\` varchar(255) NULL, \`on_behalf_of_full_name\` varchar(255) NULL, \`on_behalf_of_phone\` varchar(255) NULL, \`comment\` text NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`campaign_participants\` (\`campaign_id\` varchar(36) NOT NULL, \`user_id\` varchar(36) NOT NULL, INDEX \`IDX_0900aab78bcaf88302272c327a\` (\`campaign_id\`), INDEX \`IDX_5cea94d6e347971c6d70d17eb4\` (\`user_id\`), PRIMARY KEY (\`campaign_id\`, \`user_id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`transactions\` ADD UNIQUE INDEX \`IDX_dd85cc865e0c3d5d4be095d3f3\` (\`reference\`)`,
    );
    await queryRunner.query(
      `ALTER TABLE \`wallets\` CHANGE \`version\` \`version\` int NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_cb22ea24dfa5f43ba4632f9b14\` ON \`webhook_logs\` (\`gateway_reference\`)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`REL_92558c08091598f7a4439586cd\` ON \`wallets\` (\`user_id\`)`,
    );
    await queryRunner.query(
      `ALTER TABLE \`profiles\` ADD CONSTRAINT \`FK_9e432b7df0d182f8d292902d1a2\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`kycs\` ADD CONSTRAINT \`FK_bbfe1fa864841e82cff1be09e8b\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`campaigns\` ADD CONSTRAINT \`FK_02667e84fa5f98ed5752c30298c\` FOREIGN KEY (\`creator_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`donations\` ADD CONSTRAINT \`FK_6d627a82b263d4ad02bd2255930\` FOREIGN KEY (\`donor_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`donations\` ADD CONSTRAINT \`FK_6ad4405f42816956aa8a89bc9fb\` FOREIGN KEY (\`campaign_id\`) REFERENCES \`campaigns\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`donations\` ADD CONSTRAINT \`FK_c9891480ca78603e9c4008dcbec\` FOREIGN KEY (\`transaction_id\`) REFERENCES \`transactions\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`donations\` ADD CONSTRAINT \`FK_55a94ca2292e1b89b68fbf92162\` FOREIGN KEY (\`on_behalf_of_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`campaign_participants\` ADD CONSTRAINT \`FK_0900aab78bcaf88302272c327af\` FOREIGN KEY (\`campaign_id\`) REFERENCES \`campaigns\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE \`campaign_participants\` ADD CONSTRAINT \`FK_5cea94d6e347971c6d70d17eb44\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`campaign_participants\` DROP FOREIGN KEY \`FK_5cea94d6e347971c6d70d17eb44\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`campaign_participants\` DROP FOREIGN KEY \`FK_0900aab78bcaf88302272c327af\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`donations\` DROP FOREIGN KEY \`FK_55a94ca2292e1b89b68fbf92162\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`donations\` DROP FOREIGN KEY \`FK_c9891480ca78603e9c4008dcbec\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`donations\` DROP FOREIGN KEY \`FK_6ad4405f42816956aa8a89bc9fb\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`donations\` DROP FOREIGN KEY \`FK_6d627a82b263d4ad02bd2255930\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`campaigns\` DROP FOREIGN KEY \`FK_02667e84fa5f98ed5752c30298c\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`kycs\` DROP FOREIGN KEY \`FK_bbfe1fa864841e82cff1be09e8b\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`profiles\` DROP FOREIGN KEY \`FK_9e432b7df0d182f8d292902d1a2\``,
    );
    await queryRunner.query(
      `DROP INDEX \`REL_92558c08091598f7a4439586cd\` ON \`wallets\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_cb22ea24dfa5f43ba4632f9b14\` ON \`webhook_logs\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`wallets\` CHANGE \`version\` \`version\` int NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`transactions\` DROP INDEX \`IDX_dd85cc865e0c3d5d4be095d3f3\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_5cea94d6e347971c6d70d17eb4\` ON \`campaign_participants\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_0900aab78bcaf88302272c327a\` ON \`campaign_participants\``,
    );
    await queryRunner.query(`DROP TABLE \`campaign_participants\``);
    await queryRunner.query(`DROP TABLE \`donations\``);
    await queryRunner.query(`DROP TABLE \`campaigns\``);
  }
}
