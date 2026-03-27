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
            'Greyfundr',
            'greyfundr',
            JSON_OBJECT(
            'bundleId',    'com.greyfundr.ios',
            'appStoreUrl', 'https://greyfundr.com/',
            'teamId',      ''
            ),
            JSON_OBJECT(
            'packageName',            'com.greyfundr.android',
            'playStoreUrl',           'https://greyfundr.com/',
            'sha256CertFingerprints', JSON_ARRAY(
                '34:C8:94:A0:79:5A:D9:AA:31:E1:47:73:4D:05:3B:8C:21:7A:DE:73:5E:97:D3:9C:B9:82:0A:2B:C2:DA:47:FB',
                '69:48:65:4C:B5:79:A2:A8:27:43:49:CD:52:14:65:07:61:44:5F:0F:6E:B2:AB:A7:C4:1F:FB:02:F7:96:A2:76'
            )
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
