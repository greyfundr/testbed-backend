import { MigrationInterface, QueryRunner } from 'typeorm';

// Backs the Updates tab on the campaign details page — organiser
// broadcasts posted by the campaign's creator or its organisers.
export class CreateCampaignUpdates1777700000001
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`campaign_updates\` (
         \`id\`          VARCHAR(36)   NOT NULL,
         \`campaign_id\` VARCHAR(255)  NOT NULL,
         \`author_id\`   VARCHAR(255)  NOT NULL,
         \`body\`        TEXT          NOT NULL,
         \`pinned\`      TINYINT(1)    NOT NULL DEFAULT 0,
         \`created_at\`  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
         \`updated_at\`  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                       ON UPDATE CURRENT_TIMESTAMP,
         PRIMARY KEY (\`id\`),
         INDEX \`idx_campaign_updates_campaign_created\`
           (\`campaign_id\`, \`created_at\`),
         CONSTRAINT \`fk_campaign_updates_campaign\`
           FOREIGN KEY (\`campaign_id\`)
           REFERENCES \`campaigns\`(\`id\`)
           ON DELETE CASCADE,
         CONSTRAINT \`fk_campaign_updates_author\`
           FOREIGN KEY (\`author_id\`)
           REFERENCES \`users\`(\`id\`)
           ON DELETE CASCADE
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`campaign_updates\``);
  }
}
