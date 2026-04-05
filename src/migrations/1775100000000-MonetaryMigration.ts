import { MigrationInterface, QueryRunner } from 'typeorm';

export class MonetaryMigration1775100000000 implements MigrationInterface {
  name = 'MonetaryMigration1775100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // wallets
    await queryRunner.query(
      `ALTER TABLE \`wallets\` MODIFY \`available_balance\` decimal(20,2) NOT NULL DEFAULT '0.00'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`wallets\` MODIFY \`ledger_balance\` decimal(20,2) NOT NULL DEFAULT '0.00'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`wallets\` MODIFY \`escrow_balance\` decimal(20,2) NOT NULL DEFAULT '0.00'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`wallets\` MODIFY \`lifetime_credited\` decimal(20,2) NOT NULL DEFAULT '0.00'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`wallets\` MODIFY \`lifetime_debited\` decimal(20,2) NOT NULL DEFAULT '0.00'`,
    );

    // withdrawal_requests
    await queryRunner.query(
      `ALTER TABLE \`withdrawal_requests\` MODIFY \`amount\` decimal(20,2) NOT NULL`,
    );

    // transactions
    await queryRunner.query(
      `ALTER TABLE \`transactions\` MODIFY \`amount\` decimal(20,2) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`transactions\` MODIFY \`fee_amount\` decimal(20,2) NOT NULL DEFAULT '0.00'`,
    );

    // ledger_entries
    await queryRunner.query(
      `ALTER TABLE \`ledger_entries\` MODIFY \`amount\` decimal(20,2) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`ledger_entries\` MODIFY \`running_balance\` decimal(20,2) NULL`,
    );

    // split_bills
    await queryRunner.query(
      `ALTER TABLE \`split_bills\` MODIFY \`total_amount\` decimal(20,2) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bills\` MODIFY \`total_collected\` decimal(20,2) NOT NULL DEFAULT '0.00'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bills\` MODIFY \`min_payment_amount\` decimal(20,2) NULL`,
    );

    // split_bill_participants
    await queryRunner.query(
      `ALTER TABLE \`split_bill_participants\` MODIFY \`amount_owed\` decimal(20,2) NOT NULL DEFAULT '0.00'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_participants\` MODIFY \`amount_paid\` decimal(20,2) NOT NULL DEFAULT '0.00'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_participants\` MODIFY \`amount_remaining\` decimal(20,2) NOT NULL DEFAULT '0.00'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_participants\` MODIFY \`balance_adjustment\` decimal(20,2) NOT NULL DEFAULT '0.00'`,
    );

    // split_bill_activities
    await queryRunner.query(
      `ALTER TABLE \`split_bill_activities\` MODIFY \`amount_before\` decimal(20,2) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_activities\` MODIFY \`amount_after\` decimal(20,2) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`split_bill_activities\` MODIFY \`amount_difference\` decimal(20,2) NULL`,
    );

    // events
    await queryRunner.query(
      `ALTER TABLE \`events\` MODIFY \`target_amount\` decimal(20,2) NOT NULL DEFAULT '0.00'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`events\` MODIFY \`amount_raised\` decimal(20,2) NOT NULL DEFAULT '0.00'`,
    );

    // event_contributions
    await queryRunner.query(
      `ALTER TABLE \`event_contributions\` MODIFY \`amount\` decimal(20,2) NOT NULL DEFAULT '0.00'`,
    );

    // campaigns
    await queryRunner.query(
      `ALTER TABLE \`campaigns\` MODIFY \`target\` decimal(20,2) NOT NULL DEFAULT '0.00'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`campaigns\` MODIFY \`current_amount\` decimal(20,2) NOT NULL DEFAULT '0.00'`,
    );

    // donations
    await queryRunner.query(
      `ALTER TABLE \`donations\` MODIFY \`amount\` decimal(20,2) NOT NULL DEFAULT '0.00'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Note: Reverting back to bigint would require careful precision handling.
    // Usually, the previous state was bigint (which stores kobo).
    // Reverting would likely involve multiplying by 100 first, which is complex for a 'down' migration.
  }
}
