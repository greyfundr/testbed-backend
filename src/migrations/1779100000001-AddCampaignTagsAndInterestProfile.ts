import { MigrationInterface, QueryRunner } from 'typeorm';

// Three additive structures to power the charity "For You" feed:
//
//   1. campaigns.tags             — JSON array of tag slugs derived
//                                   from title + description + category,
//                                   eg. ["education","child","kenya"].
//   2. user_interest_profiles     — denormalized per-user vector of
//                                   {tag: weight} derived from the
//                                   user's donate / like / save /
//                                   comment / amplifier signals.
//   3. campaign_views             — raw view log (and optional dwell
//                                   time) used as a weak interest
//                                   signal + drives the trending
//                                   sub-score in the feed.
//
// Purely additive — a new column on an existing table (nullable, so
// every existing row keeps working unchanged) and two new tables.
// Safe on the shared prod+testbed Aiven DB per the testbed contract.
export class AddCampaignTagsAndInterestProfile1779100000001
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Aiven MySQL doesn't support ADD COLUMN IF NOT EXISTS, so we
    // check INFORMATION_SCHEMA first and only run the ALTER when
    // the column is genuinely missing. Same idempotent intent.
    const tagsCol = (await queryRunner.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'campaigns'
          AND COLUMN_NAME = 'tags'`,
    )) as Array<{ COLUMN_NAME: string }>;
    if (tagsCol.length === 0) {
      await queryRunner.query(
        `ALTER TABLE \`campaigns\` ADD COLUMN \`tags\` JSON NULL`,
      );
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`user_interest_profiles\` (
        \`user_id\` varchar(36) NOT NULL,
        \`tag_weights_json\` JSON NOT NULL,
        \`last_event_at\` timestamp(6) NULL,
        \`updated_at\` timestamp(6) NOT NULL
          DEFAULT CURRENT_TIMESTAMP(6)
          ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`user_id\`),
        CONSTRAINT \`FK_uip_user\`
          FOREIGN KEY (\`user_id\`)
          REFERENCES \`users\`(\`id\`)
          ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`campaign_views\` (
        \`id\` varchar(36) NOT NULL,
        \`campaign_id\` varchar(36) NOT NULL,
        \`user_id\` varchar(36) NULL,
        \`dwell_ms\` int NULL,
        \`viewed_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_cv_campaign\` (\`campaign_id\`, \`viewed_at\`),
        INDEX \`IDX_cv_user\` (\`user_id\`, \`viewed_at\`),
        CONSTRAINT \`FK_cv_campaign\`
          FOREIGN KEY (\`campaign_id\`)
          REFERENCES \`campaigns\`(\`id\`)
          ON DELETE CASCADE,
        CONSTRAINT \`FK_cv_user\`
          FOREIGN KEY (\`user_id\`)
          REFERENCES \`users\`(\`id\`)
          ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);
  }

  public async down(): Promise<void> {
    // No-op on purpose — testbed and prod share one DB and our
    // migration contract is strictly additive. Drop by hand if a
    // rollback is genuinely needed.
  }
}
