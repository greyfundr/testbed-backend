import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRsvpCountAndHideDonation1712245200000 implements MigrationInterface {
  name = 'AddRsvpCountAndHideDonation1712245200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "events" 
            ADD "rsvp_count" integer NOT NULL DEFAULT 0
        `);

    await queryRunner.query(`
            ALTER TABLE "events" 
            ADD "hide_donation_amount" boolean NOT NULL DEFAULT false
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "events" DROP COLUMN "hide_donation_amount"`,
    );
    await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "rsvp_count"`);
  }
}
