import { MigrationInterface, QueryRunner } from 'typeorm';

// Adds the three governance tables for split bills:
//   • split_bill_vendors          — beneficiaries attached to a bill
//   • split_bill_proposals        — proposed disbursements pending votes
//   • split_bill_proposal_votes   — one vote per participant per proposal
//
// Mirrors the campaign-side governance schema, simplified (no
// allocations or random-donor routing — split bills have a fixed
// participant set so every participant votes directly).
//
// Purely additive — no drops, no existing-column changes. Safe to
// run on the shared prod+testbed DB.
export class AddSplitBillGovernance1778500000001
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`split_bill_vendors\` (
        \`id\` varchar(36) NOT NULL,
        \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at\` timestamp(6) NULL,
        \`split_bill_id\` varchar(36) NOT NULL,
        \`name\` varchar(120) NOT NULL,
        \`kind\` enum('vendor','individual','internal') NOT NULL DEFAULT 'vendor',
        \`bank_name\` varchar(120) NULL,
        \`account_name\` varchar(120) NULL,
        \`account_number\` varchar(32) NULL,
        \`contact\` varchar(120) NULL,
        \`notes\` text NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_sbv_split_bill_id\` (\`split_bill_id\`),
        CONSTRAINT \`FK_sbv_split_bill\`
          FOREIGN KEY (\`split_bill_id\`)
          REFERENCES \`split_bills\`(\`id\`)
          ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`split_bill_proposals\` (
        \`id\` varchar(36) NOT NULL,
        \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at\` timestamp(6) NULL,
        \`split_bill_id\` varchar(36) NOT NULL,
        \`proposer_id\` varchar(36) NOT NULL,
        \`title\` varchar(200) NOT NULL,
        \`purpose\` text NULL,
        \`vendor_id\` varchar(36) NULL,
        \`total_amount\` decimal(20,2) NOT NULL DEFAULT '0.00',
        \`status\` enum('pending','approved','rejected','executed','cancelled') NOT NULL DEFAULT 'pending',
        \`required_approvals\` int NOT NULL,
        \`votes_for\` int NOT NULL DEFAULT 0,
        \`votes_against\` int NOT NULL DEFAULT 0,
        \`decided_at\` timestamp NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_sbp_split_bill_id\` (\`split_bill_id\`),
        INDEX \`IDX_sbp_proposer_id\` (\`proposer_id\`),
        INDEX \`IDX_sbp_vendor_id\` (\`vendor_id\`),
        CONSTRAINT \`FK_sbp_split_bill\`
          FOREIGN KEY (\`split_bill_id\`)
          REFERENCES \`split_bills\`(\`id\`)
          ON DELETE CASCADE,
        CONSTRAINT \`FK_sbp_proposer\`
          FOREIGN KEY (\`proposer_id\`)
          REFERENCES \`users\`(\`id\`)
          ON DELETE RESTRICT,
        CONSTRAINT \`FK_sbp_vendor\`
          FOREIGN KEY (\`vendor_id\`)
          REFERENCES \`split_bill_vendors\`(\`id\`)
          ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`split_bill_proposal_votes\` (
        \`id\` varchar(36) NOT NULL,
        \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at\` timestamp(6) NULL,
        \`proposal_id\` varchar(36) NOT NULL,
        \`voter_id\` varchar(36) NOT NULL,
        \`vote\` enum('approve','reject') NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`UQ_sb_proposal_voter\` (\`proposal_id\`, \`voter_id\`),
        CONSTRAINT \`FK_sbpv_proposal\`
          FOREIGN KEY (\`proposal_id\`)
          REFERENCES \`split_bill_proposals\`(\`id\`)
          ON DELETE CASCADE,
        CONSTRAINT \`FK_sbpv_voter\`
          FOREIGN KEY (\`voter_id\`)
          REFERENCES \`users\`(\`id\`)
          ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop in reverse order so FKs don't block the drops.
    await queryRunner.query(
      `DROP TABLE IF EXISTS \`split_bill_proposal_votes\``,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS \`split_bill_proposals\``,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS \`split_bill_vendors\``,
    );
  }
}
