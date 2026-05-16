import { MigrationInterface, QueryRunner } from 'typeorm';

// `campaign_saves` was originally created without a `deleted_at`
// column, but the AbstractEntity base class (which CampaignSave
// extends) declares one via @DeleteDateColumn. TypeORM auto-includes
// `WHERE deleted_at IS NULL` on every query, which 1054-errors with
// "Unknown column 'CampaignSave.deleted_at'" — that's why the
// charity screen wasn't loading. Adding the column nullable is
// strictly additive, so production code that ignores it keeps
// working.
export class AddDeletedAtToCampaignSaves1777900000001
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`campaign_saves\` ADD COLUMN \`deleted_at\` TIMESTAMP(6) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`campaign_saves\` DROP COLUMN \`deleted_at\``,
    );
  }
}
