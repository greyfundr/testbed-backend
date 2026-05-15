import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendCampaignsForDetailsPage1777400000001
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`campaigns\`
         ADD COLUMN \`location\`             VARCHAR(120) NULL,
         ADD COLUMN \`urgent\`               TINYINT(1)   NOT NULL DEFAULT 0,
         ADD COLUMN \`accountability_note\`  TEXT         NULL,
         ADD COLUMN \`story\`                JSON         NULL,
         ADD COLUMN \`tiers\`                JSON         NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`campaigns\`
         DROP COLUMN \`location\`,
         DROP COLUMN \`urgent\`,
         DROP COLUMN \`accountability_note\`,
         DROP COLUMN \`story\`,
         DROP COLUMN \`tiers\``,
    );
  }
}
