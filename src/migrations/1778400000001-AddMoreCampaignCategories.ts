import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seed six additional categories: Weddings, Memorial, Sports,
 * Emergency, Arts, Community. INSERT IGNORE so the migration is
 * idempotent — re-running won't error on the unique `name` / `slug`
 * indexes if the row already exists.
 *
 * Hardcoded UUIDs so any code that references a specific category id
 * (none today, but future-proofs against drift) stays stable across
 * environments.
 */
export class AddMoreCampaignCategories1778400000001
  implements MigrationInterface
{
  private readonly rows = [
    {
      id: '80000001-0001-4000-8000-000000000001',
      name: 'Weddings',
      slug: 'weddings',
      icon: 'heart-handshake',
    },
    {
      id: '80000002-0002-4000-8000-000000000002',
      name: 'Memorial',
      slug: 'memorial',
      icon: 'flower-2',
    },
    {
      id: '80000003-0003-4000-8000-000000000003',
      name: 'Sports',
      slug: 'sports',
      icon: 'trophy',
    },
    {
      id: '80000004-0004-4000-8000-000000000004',
      name: 'Emergency',
      slug: 'emergency',
      icon: 'ambulance',
    },
    {
      id: '80000005-0005-4000-8000-000000000005',
      name: 'Arts',
      slug: 'arts',
      icon: 'palette',
    },
    {
      id: '80000006-0006-4000-8000-000000000006',
      name: 'Community',
      slug: 'community',
      icon: 'users-round',
    },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const r of this.rows) {
      await queryRunner.query(
        `INSERT IGNORE INTO \`campaign_categories\`
           (\`id\`, \`name\`, \`slug\`, \`icon\`, \`is_active\`)
         VALUES (?, ?, ?, ?, 1)`,
        [r.id, r.name, r.slug, r.icon],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Only remove rows that are still orphaned (no campaigns
    // referencing them) so we never break FK integrity on rollback.
    for (const r of this.rows) {
      await queryRunner.query(
        `DELETE FROM \`campaign_categories\`
         WHERE \`id\` = ?
           AND NOT EXISTS (
             SELECT 1 FROM \`campaigns\` WHERE \`category_id\` = ?
           )`,
        [r.id, r.id],
      );
    }
  }
}
