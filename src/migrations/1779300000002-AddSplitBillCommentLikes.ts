import { MigrationInterface, QueryRunner } from 'typeorm';

// New table for per-comment likes on split-bill comments. Unique
// (comment_id, user_id) so a user can like a given comment only once
// — toggling off DELETEs the row. Cascade from comment so likes are
// cleaned up when a comment is hard-deleted; cascade from user so the
// row goes with the user on account deletion.
export class AddSplitBillCommentLikes1779300000002
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`split_bill_comment_likes\` (
        \`id\` varchar(36) NOT NULL,
        \`comment_id\` varchar(36) NOT NULL,
        \`user_id\` varchar(36) NOT NULL,
        \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`uq_sbcl_comment_user\` (\`comment_id\`, \`user_id\`),
        INDEX \`idx_sbcl_comment\` (\`comment_id\`),
        CONSTRAINT \`FK_sbcl_comment\`
          FOREIGN KEY (\`comment_id\`)
          REFERENCES \`split_bill_comments\`(\`id\`)
          ON DELETE CASCADE,
        CONSTRAINT \`FK_sbcl_user\`
          FOREIGN KEY (\`user_id\`)
          REFERENCES \`users\`(\`id\`)
          ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS \`split_bill_comment_likes\``,
    );
  }
}
