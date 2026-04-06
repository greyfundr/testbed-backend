import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBvnToUser1712435812000 implements MigrationInterface {
  name = 'AddBvnToUser1712435812000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "users" 
            ADD "bvn" varchar(11) NULL
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "users" 
            DROP COLUMN "bvn"
        `);
  }
}
