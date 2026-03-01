import { MigrationInterface, QueryRunner } from "typeorm";

export class AdminEntity1772385207051 implements MigrationInterface {
    name = 'AdminEntity1772385207051'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX \`IDX_dd85cc865e0c3d5d4be095d3f3\` ON \`transactions\``);
        await queryRunner.query(`ALTER TABLE \`transactions\` ADD UNIQUE INDEX \`IDX_dd85cc865e0c3d5d4be095d3f3\` (\`reference\`)`);
        await queryRunner.query(`ALTER TABLE \`campaigns\` DROP COLUMN \`fee_percentage\``);
        await queryRunner.query(`ALTER TABLE \`campaigns\` ADD \`fee_percentage\` decimal(5,2) NOT NULL DEFAULT '0.00'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`campaigns\` DROP COLUMN \`fee_percentage\``);
        await queryRunner.query(`ALTER TABLE \`campaigns\` ADD \`fee_percentage\` bigint NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE \`transactions\` DROP INDEX \`IDX_dd85cc865e0c3d5d4be095d3f3\``);
        await queryRunner.query(`CREATE UNIQUE INDEX \`IDX_dd85cc865e0c3d5d4be095d3f3\` ON \`transactions\` (\`reference\`)`);
    }

}
