import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWalletSystem1771453707735 implements MigrationInterface {
  name = 'AddWalletSystem1771453707735';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`virtual_accounts\` (
        \`id\`                     varchar(36)   NOT NULL,
        \`created_at\`             timestamp(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\`             timestamp(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at\`             timestamp(6)  NULL,
        \`wallet_id\`              varchar(255)  NOT NULL,
        \`account_number\`         varchar(255)  NOT NULL,
        \`account_name\`           varchar(255)  NOT NULL,
        \`bank_name\`              varchar(255)  NOT NULL,
        \`bank_code\`              varchar(255)  NOT NULL,
        \`paystack_customer_id\`    varchar(255)  NOT NULL,
        \`paystack_customer_code\`  varchar(255)  NOT NULL,
        \`paystack_dva_id\`         varchar(255)  NULL,
        \`status\`                 varchar(255)  NOT NULL DEFAULT 'active',
        \`is_assigned\`            tinyint       NOT NULL DEFAULT 0,
        \`paystack_meta\`           json          NULL,
        UNIQUE INDEX \`IDX_08eb7dc513ac945268a3ad0281\` (\`account_number\`),
        UNIQUE INDEX \`REL_3fc9524655cb89bcce857fe217\` (\`wallet_id\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`transactions\` (
        \`id\`                     varchar(36)   NOT NULL,
        \`created_at\`             timestamp(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\`             timestamp(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at\`             timestamp(6)  NULL,
        \`wallet_id\`              varchar(255)  NOT NULL,
        \`amount\`                 bigint        NOT NULL,
        \`currency\`               varchar(255)  NOT NULL DEFAULT 'NGN',
        \`type\`                   varchar(255)  NOT NULL,
        \`direction\`              varchar(255)  NOT NULL,
        \`status\`                 varchar(255)  NOT NULL DEFAULT 'pending',
        \`reference\`              varchar(255)  NOT NULL,
        \`gateway_reference\`      varchar(255)  NULL,
        \`idempotency_key\`        varchar(255)  NULL,
        \`description\`            text          NULL,
        \`failure_reason\`         text          NULL,
        \`source_ref\`             json          NULL,
        \`counterparty_wallet_id\` varchar(255)  NULL,
        \`fee_amount\`             bigint        NOT NULL DEFAULT '0',
        \`gateway_response\`       json          NULL,
        \`metadata\`               json          NULL,
        \`confirmed_at\`           timestamp     NULL,
        INDEX        \`IDX_35fc4b83a39ef23f08a4b5ac9c\` (\`type\`, \`status\`),
        INDEX        \`IDX_d51c841b1d5cb5a200d73a5b20\` (\`gateway_reference\`),
        INDEX        \`IDX_e577677a072718d00c47210a2b\` (\`wallet_id\`, \`created_at\`),
        UNIQUE INDEX \`IDX_dd85cc865e0c3d5d4be095d3f3\` (\`reference\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);
    // ↑ duplicate UNIQUE INDEX on `reference` removed — one declaration is enough

    await queryRunner.query(`
      CREATE TABLE \`ledger_entries\` (
        \`id\`                varchar(36)   NOT NULL,
        \`created_at\`        timestamp(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\`        timestamp(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at\`        timestamp(6)  NULL,
        \`transaction_id\`    varchar(255)  NOT NULL,
        \`wallet_id\`         varchar(255)  NULL,
        \`account_type\`      varchar(255)  NOT NULL,
        \`account_entity_id\` varchar(255)  NULL,
        \`direction\`         varchar(255)  NOT NULL,
        \`amount\`            bigint        NOT NULL,
        \`currency\`          varchar(255)  NOT NULL DEFAULT 'NGN',
        \`running_balance\`   bigint        NULL,
        \`description\`       text          NULL,
        INDEX \`IDX_7f87e460c1b231bbcfd480b2fc\` (\`account_type\`),
        INDEX \`IDX_b26c5ef5853fd6e0a8680427f6\` (\`transaction_id\`),
        INDEX \`IDX_ac345606110663f9a904028e63\` (\`wallet_id\`, \`created_at\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`webhook_logs\` (
        \`id\`               varchar(36)   NOT NULL,
        \`created_at\`       timestamp(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\`       timestamp(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at\`       timestamp(6)  NULL,
        \`event\`            varchar(255)  NOT NULL,
        \`gateway_reference\` varchar(255) NOT NULL,
        \`payload\`          json          NOT NULL,
        \`is_processed\`     tinyint       NOT NULL DEFAULT 0,
        \`processing_error\` text          NULL,
        \`retry_count\`      int           NOT NULL DEFAULT '0',
        \`processed_at\`     timestamp     NULL,
        UNIQUE INDEX \`IDX_cb22ea24dfa5f43ba4632f9b14\` (\`gateway_reference\`),
        INDEX        \`IDX_03c22578ebbd5b4b5d3ef48e64\` (\`event\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`wallets\` (
        \`id\`                varchar(36)   NOT NULL,
        \`created_at\`        timestamp(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\`        timestamp(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at\`        timestamp(6)  NULL,
        \`user_id\`           varchar(255)  NOT NULL,
        \`available_balance\` bigint        NOT NULL DEFAULT '0',
        \`ledger_balance\`    bigint        NOT NULL DEFAULT '0',
        \`escrow_balance\`    bigint        NOT NULL DEFAULT '0',
        \`lifetime_credited\` bigint        NOT NULL DEFAULT '0',
        \`lifetime_debited\`  bigint        NOT NULL DEFAULT '0',
        \`currency\`          varchar(255)  NOT NULL DEFAULT 'NGN',
        \`status\`            varchar(255)  NOT NULL DEFAULT 'active',
        \`freeze_reason\`     text          NULL,
        \`version\`           int           NOT NULL DEFAULT 0,
        UNIQUE INDEX \`IDX_92558c08091598f7a4439586cd\` (\`user_id\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`withdrawal_requests\` (
        \`id\`                   varchar(36)   NOT NULL,
        \`created_at\`           timestamp(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\`           timestamp(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at\`           timestamp(6)  NULL,
        \`wallet_id\`            varchar(255)  NOT NULL,
        \`amount\`               bigint        NOT NULL,
        \`currency\`             varchar(255)  NOT NULL DEFAULT 'NGN',
        \`recipient_code\`       varchar(255)  NOT NULL,
        \`bank_details\`         json          NOT NULL,
        \`status\`               varchar(255)  NOT NULL DEFAULT 'pending',
        \`transaction_id\`       varchar(255)  NULL,
        \`payment_transfer_code\` varchar(255) NULL,
        \`failure_reason\`       text          NULL,
        INDEX \`IDX_c846c2dcd35c9ee4cb5e52ebe6\` (\`wallet_id\`, \`status\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`bank_accounts\` (
        \`id\`             varchar(36)   NOT NULL,
        \`created_at\`     timestamp(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\`     timestamp(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at\`     timestamp(6)  NULL,
        \`user_id\`        varchar(255)  NOT NULL,
        \`account_number\` varchar(255)  NOT NULL,
        \`account_name\`   varchar(255)  NOT NULL,
        \`bank_name\`      varchar(255)  NOT NULL,
        \`bank_code\`      varchar(255)  NOT NULL,
        \`recipient_code\` varchar(255)  NOT NULL,
        \`is_default\`     tinyint       NOT NULL DEFAULT 0,
        \`is_active\`      tinyint       NOT NULL DEFAULT 1,
        \`is_verified\`    tinyint       NOT NULL DEFAULT 0,
        INDEX \`IDX_29146c4a8026c77c712e01d922\` (\`user_id\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);

    // ── Foreign keys ─────────────────────────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE \`virtual_accounts\`   ADD CONSTRAINT \`FK_3fc9524655cb89bcce857fe217a\` FOREIGN KEY (\`wallet_id\`)      REFERENCES \`wallets\`(\`id\`)      ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`transactions\`       ADD CONSTRAINT \`FK_0b171330be0cb621f8d73b87a9e\` FOREIGN KEY (\`wallet_id\`)      REFERENCES \`wallets\`(\`id\`)      ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`ledger_entries\`     ADD CONSTRAINT \`FK_b26c5ef5853fd6e0a8680427f60\` FOREIGN KEY (\`transaction_id\`) REFERENCES \`transactions\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`ledger_entries\`     ADD CONSTRAINT \`FK_bb5cd6d7046b98d8faabe9c18fe\` FOREIGN KEY (\`wallet_id\`)      REFERENCES \`wallets\`(\`id\`)      ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`wallets\`            ADD CONSTRAINT \`FK_92558c08091598f7a4439586cda\` FOREIGN KEY (\`user_id\`)        REFERENCES \`users\`(\`id\`)        ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`withdrawal_requests\` ADD CONSTRAINT \`FK_09ba365288c710bc15432553fcd\` FOREIGN KEY (\`wallet_id\`)     REFERENCES \`wallets\`(\`id\`)      ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`withdrawal_requests\` ADD CONSTRAINT \`FK_68f2992e2d3ccec9c2fc3e805e2\` FOREIGN KEY (\`transaction_id\`) REFERENCES \`transactions\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`bank_accounts\`      ADD CONSTRAINT \`FK_29146c4a8026c77c712e01d922b\` FOREIGN KEY (\`user_id\`)        REFERENCES \`users\`(\`id\`)        ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys first
    await queryRunner.query(
      `ALTER TABLE \`bank_accounts\`       DROP FOREIGN KEY \`FK_29146c4a8026c77c712e01d922b\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`withdrawal_requests\` DROP FOREIGN KEY \`FK_68f2992e2d3ccec9c2fc3e805e2\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`withdrawal_requests\` DROP FOREIGN KEY \`FK_09ba365288c710bc15432553fcd\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`wallets\`             DROP FOREIGN KEY \`FK_92558c08091598f7a4439586cda\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`ledger_entries\`      DROP FOREIGN KEY \`FK_bb5cd6d7046b98d8faabe9c18fe\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`ledger_entries\`      DROP FOREIGN KEY \`FK_b26c5ef5853fd6e0a8680427f60\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`transactions\`        DROP FOREIGN KEY \`FK_0b171330be0cb621f8d73b87a9e\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`virtual_accounts\`    DROP FOREIGN KEY \`FK_3fc9524655cb89bcce857fe217a\``,
    );

    // Drop tables (children before parents)
    await queryRunner.query(`DROP TABLE \`bank_accounts\``);
    await queryRunner.query(`DROP TABLE \`withdrawal_requests\``);
    await queryRunner.query(`DROP TABLE \`wallets\``);
    await queryRunner.query(`DROP TABLE \`webhook_logs\``);
    await queryRunner.query(`DROP TABLE \`ledger_entries\``);
    await queryRunner.query(`DROP TABLE \`transactions\``);
    await queryRunner.query(`DROP TABLE \`virtual_accounts\``);
  }
}
