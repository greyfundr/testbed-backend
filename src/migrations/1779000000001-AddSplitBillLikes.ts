import { MigrationInterface, QueryRunner } from 'typeorm';

// Adds the `split_bill_likes` table so users can like a split bill,
// mirroring the long-standing `campaign_likes` table. Drives the
// heart-with-count action on the bill detail hero.
//
// Strictly additive: a new table only, no changes to existing
// columns or constraints. Safe to apply on the shared prod+testbed
// database.
export class AddSplitBillLikes1779000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`split_bill_likes\` (
        \`id\` varchar(36) NOT NULL,
        \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`split_bill_id\` varchar(36) NOT NULL,
        \`user_id\` varchar(36) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_sbl_bill_user\` (\`split_bill_id\`, \`user_id\`),
        INDEX \`IDX_sbl_split_bill_id\` (\`split_bill_id\`),
        INDEX \`IDX_sbl_user_id\` (\`user_id\`),
        CONSTRAINT \`FK_sbl_split_bill\`
          FOREIGN KEY (\`split_bill_id\`)
          REFERENCES \`split_bills\`(\`id\`)
          ON DELETE CASCADE,
        CONSTRAINT \`FK_sbl_user\`
          FOREIGN KEY (\`user_id\`)
          REFERENCES \`users\`(\`id\`)
          ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  public async down(): Promise<void> {
    // Intentionally a no-op: the testbed and production share one
    // database, and our deploy contract is that migrations are
    // strictly additive — a drop here could destroy real like data
    // on prod if this migration were ever reverted there. Re-create
    // the table by hand if you genuinely need a rollback.
  }
}
