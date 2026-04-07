import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class RefactorKycOneToMany1775100000000 implements MigrationInterface {
  name = 'RefactorKycOneToMany1775100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('kycs');

    // 1. Drop Old Foreign Key safely
    const foreignKey = table?.foreignKeys.find(
      (fk) => fk.columnNames.indexOf('user_id') !== -1,
    );
    if (foreignKey) {
      await queryRunner.dropForeignKey('kycs', foreignKey);
    }

    // 2. Drop Old Unique Index safely (The old OneToOne index)
    const oldIndex = table?.indices.find(
      (idx) =>
        idx.name === 'REL_kycs_user' ||
        (idx.columnNames.includes('user_id') && idx.isUnique),
    );
    if (oldIndex) {
      await queryRunner.dropIndex('kycs', oldIndex);
    }

    // 3. Add New Columns
    await queryRunner.addColumns('kycs', [
      new TableColumn({
        name: 'attempt_count',
        type: 'int',
        default: 0,
      }),
      new TableColumn({
        name: 'verified_at',
        type: 'timestamp',
        isNullable: true,
      }),
      new TableColumn({
        name: 'rejected_at',
        type: 'timestamp',
        isNullable: true,
      }),
    ]);

    // 4. Create New Composite Unique Index (User ID + Level Name)
    await queryRunner.createIndex(
      'kycs',
      new TableIndex({
        name: 'IDX_kycs_user_level',
        columnNames: ['user_id', 'name'],
        isUnique: true,
      }),
    );

    // 5. Restore Foreign Key as ManyToOne
    await queryRunner.createForeignKey(
      'kycs',
      new TableForeignKey({
        name: 'FK_kycs_user',
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('kycs');

    // Remove new logic
    const fk = table?.foreignKeys.find((fk) => fk.name === 'FK_kycs_user');
    if (fk) await queryRunner.dropForeignKey('kycs', fk);

    await queryRunner.dropIndex('kycs', 'IDX_kycs_user_level');

    await queryRunner.dropColumns('kycs', [
      'attempt_count',
      'verified_at',
      'rejected_at',
    ]);

    // Restore OneToOne state
    await queryRunner.createIndex(
      'kycs',
      new TableIndex({
        name: 'REL_kycs_user',
        columnNames: ['user_id'],
        isUnique: true,
      }),
    );

    await queryRunner.createForeignKey(
      'kycs',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );
  }
}
