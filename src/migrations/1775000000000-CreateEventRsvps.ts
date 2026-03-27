import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEventRsvps1775000000000 implements MigrationInterface {
  name = 'CreateEventRsvps1775000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`event_rsvps\` (
        \`id\`              varchar(36)   NOT NULL,
        \`created_at\`      timestamp(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\`      timestamp(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at\`      timestamp(6)  NULL,
        \`event_id\`        varchar(36)   NOT NULL,
        \`user_id\`         varchar(36)   NULL,
        \`name\`            varchar(255)  NOT NULL,
        \`guest_email\`     varchar(255)  NULL,
        \`guest_phone\`     varchar(20)   NULL,
        \`status\`          varchar(20)   NOT NULL DEFAULT 'attending',
        \`guest_count\`     int           NOT NULL DEFAULT 1,
        \`note\`            text          NULL,
        \`self_registered\` tinyint       NOT NULL DEFAULT 1,
        \`responded_at\`    timestamp     NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`IDX_rsvp_event_user\`  (\`event_id\`, \`user_id\`),
        UNIQUE INDEX \`IDX_rsvp_event_email\` (\`event_id\`, \`guest_email\`),
        INDEX \`IDX_rsvp_event_id\` (\`event_id\`),
        INDEX \`IDX_rsvp_user_id\`  (\`user_id\`),
        INDEX \`IDX_rsvp_status\`   (\`status\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      ALTER TABLE \`event_rsvps\`
        ADD CONSTRAINT \`FK_rsvp_event\`
          FOREIGN KEY (\`event_id\`) REFERENCES \`events\`(\`id\`) ON DELETE CASCADE,
        ADD CONSTRAINT \`FK_rsvp_user\`
          FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`event_rsvps\``);
  }
}
