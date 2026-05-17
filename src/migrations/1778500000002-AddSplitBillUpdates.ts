import { MigrationInterface, QueryRunner } from 'typeorm';

// Creator-authored announcements feed for split bills. Mirrors
// `campaign_updates`. Purely additive — single CREATE TABLE.
export class AddSplitBillUpdates1778500000002
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`split_bill_updates\` (
        \`id\` varchar(36) NOT NULL,
        \`split_bill_id\` varchar(255) NOT NULL,
        \`author_id\` varchar(255) NOT NULL,
        \`body\` text NOT NULL,
        \`pinned\` tinyint NOT NULL DEFAULT 0,
        \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`idx_sbu_bill_created\` (\`split_bill_id\`, \`created_at\`),
        CONSTRAINT \`FK_sbu_split_bill\`
          FOREIGN KEY (\`split_bill_id\`)
          REFERENCES \`split_bills\`(\`id\`)
          ON DELETE CASCADE,
        CONSTRAINT \`FK_sbu_author\`
          FOREIGN KEY (\`author_id\`)
          REFERENCES \`users\`(\`id\`)
          ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS \`split_bill_updates\``,
    );
  }
}
