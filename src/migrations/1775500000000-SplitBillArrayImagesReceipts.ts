import { MigrationInterface, QueryRunner } from 'typeorm';

export class SplitBillArrayReceipts1775500000000 implements MigrationInterface {
  name = 'SplitBillArrayReceipts1775500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`split_bills\`
        ADD COLUMN \`receipts\` JSON NULL AFTER \`image_url\`
    `);

    await queryRunner.query(`
      UPDATE \`split_bills\`
        SET \`receipts\` = JSON_ARRAY(\`bill_receipt\`)
        WHERE \`bill_receipt\` IS NOT NULL
    `);

    // 3. Drop the old bill_receipt column
    await queryRunner.query(`
      ALTER TABLE \`split_bills\`
        DROP COLUMN \`bill_receipt\`
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`split_bills\`
        ADD COLUMN \`bill_receipt\` varchar(500) NULL AFTER \`image_url\`
    `);

    await queryRunner.query(`
      UPDATE \`split_bills\`
        SET \`bill_receipt\` = JSON_UNQUOTE(JSON_EXTRACT(\`receipts\`, '$[0]'))
        WHERE JSON_LENGTH(\`receipts\`) > 0
    `);

    await queryRunner.query(`
      ALTER TABLE \`split_bills\`
        DROP COLUMN \`receipts\`
    `);
  }
}
