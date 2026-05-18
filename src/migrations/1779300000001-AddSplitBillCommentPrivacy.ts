import { MigrationInterface, QueryRunner } from 'typeorm';

// Adds private-comment support to `split_bill_comments`:
//   - `visibility` toggles a row between public (everyone on the bill)
//     and private (only the sender + people listed in
//     `recipient_participant_ids`). Defaults to 'public' so existing
//     rows keep their meaning.
//   - `recipient_participant_ids` is the explicit audience for a
//     private comment (JSON array of participant ids). NULL for public.
//   - `parent_comment_id` lets replies thread under a parent so private
//     conversations stay scoped to the same audience.
//
// Strict-additive per the testbed-topology rule. No drops or renames.
export class AddSplitBillCommentPrivacy1779300000001
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = 'split_bill_comments';

    const hasVisibility = await queryRunner.hasColumn(table, 'visibility');
    if (!hasVisibility) {
      await queryRunner.query(`
        ALTER TABLE \`${table}\`
        ADD COLUMN \`visibility\` ENUM('public','private')
        NOT NULL DEFAULT 'public'
      `);
    }

    const hasRecipients = await queryRunner.hasColumn(
      table,
      'recipient_participant_ids',
    );
    if (!hasRecipients) {
      await queryRunner.query(`
        ALTER TABLE \`${table}\`
        ADD COLUMN \`recipient_participant_ids\` JSON NULL
      `);
    }

    const hasParent = await queryRunner.hasColumn(table, 'parent_comment_id');
    if (!hasParent) {
      await queryRunner.query(`
        ALTER TABLE \`${table}\`
        ADD COLUMN \`parent_comment_id\` VARCHAR(36) NULL
      `);
      // Index because list/reply queries filter by parent on private
      // threads — without it long reply chains do a full table scan.
      await queryRunner.query(`
        CREATE INDEX \`idx_split_bill_comments_parent\`
        ON \`${table}\`(\`parent_comment_id\`)
      `);
    }
  }

  // Drops are intentionally NOT mirrored — additive-only policy.
  public async down(): Promise<void> {
    // no-op
  }
}
