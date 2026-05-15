import { MigrationInterface, QueryRunner } from 'typeorm';

// Adds the `paused` value to the campaigns.status ENUM so the
// creator-only Pause/Resume action can flip the status without
// hitting a MySQL data-truncation error. Donations are blocked for
// any non-ACTIVE status — see donation.service.ts.
export class AddCampaignPausedStatus1777600000001
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`campaigns\`
         MODIFY COLUMN \`status\`
           ENUM('pending_approval','active','paused','rejected','completed','cancelled','expired')
           NOT NULL DEFAULT 'active'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE \`campaigns\` SET \`status\` = 'active' WHERE \`status\` = 'paused'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`campaigns\`
         MODIFY COLUMN \`status\`
           ENUM('pending_approval','active','rejected','completed','cancelled','expired')
           NOT NULL DEFAULT 'active'`,
    );
  }
}
