import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

// Adds an optional `cover_images_json` column on `split_bills` so a
// bill can store a multi-photo cover gallery. Nullable; existing
// rows keep working with their single `image_url`. Additive only.
export class AddSplitBillCoverImages1778700000001
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('split_bills');
    if (!table?.findColumnByName('cover_images_json')) {
      await queryRunner.addColumn(
        'split_bills',
        new TableColumn({
          name: 'cover_images_json',
          type: 'json',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('split_bills');
    if (table?.findColumnByName('cover_images_json')) {
      await queryRunner.dropColumn('split_bills', 'cover_images_json');
    }
  }
}
