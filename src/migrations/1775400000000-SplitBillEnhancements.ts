import { MigrationInterface, QueryRunner } from 'typeorm';

export class SplitBillAndEventEnhancements1775400000000 implements MigrationInterface {
  name = 'SplitBillAndEventEnhancements1775400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`split_bills\`
        ADD COLUMN \`offers\` JSON NULL AFTER \`description\`
    `);

    await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS \`split_bill_comments\` (
            \`id\` varchar(36) NOT NULL,
            \`split_bill_id\` varchar(36) NOT NULL,
            \`participant_id\` varchar(36) NOT NULL,
            \`author_id\` varchar(36) NULL,
            \`guest_phone\` varchar(20) NULL,
            \`display_name\` varchar(255) NOT NULL,
            \`display_type\` varchar(20) NOT NULL DEFAULT 'full_name',
            \`content\` text NOT NULL,
            \`transaction_id\` varchar(36) NULL,
            \`is_pinned\` tinyint NOT NULL DEFAULT 0,
            \`is_edited\` tinyint NOT NULL DEFAULT 0,
            \`edited_at\` timestamp NULL,
            \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            \`deleted_at\` timestamp(6) NULL,
            PRIMARY KEY (\`id\`),
            INDEX \`IDX_sbc_bill_created\` (\`split_bill_id\`, \`created_at\`),
            INDEX \`IDX_sbc_author_created\` (\`author_id\`, \`created_at\`),
            INDEX \`IDX_sbc_participant\` (\`participant_id\`),
            CONSTRAINT \`FK_sbc_bill\` FOREIGN KEY (\`split_bill_id\`) 
                REFERENCES \`split_bills\`(\`id\`) ON DELETE CASCADE,
            CONSTRAINT \`FK_sbc_participant\` FOREIGN KEY (\`participant_id\`) 
                REFERENCES \`split_bill_participants\`(\`id\`) ON DELETE RESTRICT,
            CONSTRAINT \`FK_sbc_author\` FOREIGN KEY (\`author_id\`) 
                REFERENCES \`users\`(\`id\`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`split_bill_comments\``);

    await queryRunner.query(`
      ALTER TABLE \`split_bills\`
        DROP COLUMN \`offers\`
    `);
  }
}
