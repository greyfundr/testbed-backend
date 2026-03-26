import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDynamicLinks1774800000000 implements MigrationInterface {
  name = 'CreateDynamicLinks1774800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`dynamic_link_projects\` (
        \`id\`          varchar(36)   NOT NULL,
        \`created_at\`  timestamp(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\`  timestamp(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at\`  timestamp(6)  NULL,
        \`name\`        varchar(100)  NOT NULL,
        \`app_scheme\`  varchar(50)   NOT NULL,
        \`ios\`         json          NOT NULL,
        \`android\`     json          NOT NULL,
        \`is_active\`   tinyint       NOT NULL DEFAULT 1,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`dynamic_links\` (
        \`id\`                  varchar(36)   NOT NULL,
        \`created_at\`          timestamp(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\`          timestamp(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at\`          timestamp(6)  NULL,
        \`project_id\`          varchar(36)   NOT NULL,
        \`short_code\`          varchar(12)   NOT NULL,
        \`type\`                varchar(20)   NOT NULL,
        \`resource_id\`         varchar(36)   NOT NULL,
        \`metadata\`            json          NULL,
        \`clicks\`              int           NOT NULL DEFAULT 0,
        \`custom_og_title\`     varchar(500)  NULL,
        \`custom_og_description\` varchar(500) NULL,
        \`custom_og_image\`     varchar(500)  NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`IDX_dynamic_links_short_code\` (\`short_code\`),
        INDEX \`IDX_dynamic_links_project_id\` (\`project_id\`),
        INDEX \`IDX_dynamic_links_type\` (\`type\`),
        INDEX \`IDX_dynamic_links_resource_id\` (\`resource_id\`),
        INDEX \`IDX_dynamic_links_type_resource\` (\`type\`, \`resource_id\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      ALTER TABLE \`dynamic_links\`
        ADD CONSTRAINT \`FK_dynamic_links_project\`
          FOREIGN KEY (\`project_id\`)
          REFERENCES \`dynamic_link_projects\`(\`id\`)
          ON DELETE CASCADE
    `);

    // Seed the Greyfundr project — update values to match your real app config
    await queryRunner.query(`
      INSERT INTO \`dynamic_link_projects\` (
        \`id\`, \`name\`, \`app_scheme\`, \`ios\`, \`android\`, \`is_active\`
      ) VALUES (
        UUID(),
        'GreyFundr',
        'greyfundr',
        JSON_OBJECT(
          'bundleId',    'com.greyfundr.app',
          'appStoreUrl', 'https://apps.apple.com/app/greyfundr/id0000000000',
          'teamId',      'YOUR_APPLE_TEAM_ID'
        ),
        JSON_OBJECT(
          'packageName',             'com.greyfundr.app',
          'playStoreUrl',            'https://play.google.com/store/apps/details?id=com.greyfundr.app',
          'sha256CertFingerprints',  JSON_ARRAY('YOUR:SHA256:FINGERPRINT')
        ),
        1
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`dynamic_links\` DROP FOREIGN KEY \`FK_dynamic_links_project\``,
    );
    await queryRunner.query(`DROP TABLE \`dynamic_links\``);
    await queryRunner.query(`DROP TABLE \`dynamic_link_projects\``);
  }
}
