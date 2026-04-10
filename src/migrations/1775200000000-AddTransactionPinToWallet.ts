import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransactionPinToWallet1775200000000 implements MigrationInterface {
  name = 'AddTransactionPinToWallet1775200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`wallets\`
        ADD COLUMN \`transaction_pin\`               varchar(255) NULL,
        ADD COLUMN \`transaction_pin_set_at\`         timestamp    NULL,
        ADD COLUMN \`transaction_pin_failed_attempts\` int NOT NULL DEFAULT 0,
        ADD COLUMN \`transaction_pin_locked_until\`   timestamp    NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`wallets\`
        DROP COLUMN \`transaction_pin_locked_until\`,
        DROP COLUMN \`transaction_pin_failed_attempts\`,
        DROP COLUMN \`transaction_pin_set_at\`,
        DROP COLUMN \`transaction_pin\`
    `);
  }
}
