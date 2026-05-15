import { MigrationInterface, QueryRunner } from 'typeorm';

// Adds invitation state to campaign_organizers so the creator can send
// an invite that the invitee can accept or reject. Existing rows are
// migrated to `accepted` so the rail looks identical post-deploy.
export class AddOrganizerInvitation1777800000001
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`campaign_organizers\`
         ADD COLUMN \`invitation_status\`
           ENUM('pending','accepted','rejected')
           NOT NULL DEFAULT 'accepted',
         ADD COLUMN \`rejection_reason\` TEXT NULL,
         ADD COLUMN \`responded_at\`     DATETIME NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`campaign_organizers\`
         DROP COLUMN \`invitation_status\`,
         DROP COLUMN \`rejection_reason\`,
         DROP COLUMN \`responded_at\``,
    );
  }
}
