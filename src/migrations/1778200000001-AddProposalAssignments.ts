import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

// Random-donor approval flow. Adds a sequential-assignment table so each
// disbursement proposal is routed to one top-donor at a time with a 2-minute
// countdown, plus four denormalised columns on `campaign_proposals` so the
// frontend can render countdowns/state without joining.
//
// Strictly additive (no drops/renames) — testbed shares the prod Aiven
// database, so this is safe to roll forward across both environments.
export class AddProposalAssignments1778200000001
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('campaign_proposal_assignments');
    if (!table) {
      await queryRunner.createTable(
        new Table({
          name: 'campaign_proposal_assignments',
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'proposal_id', type: 'varchar', length: '36' },
            { name: 'donor_user_id', type: 'varchar', length: '36' },
            {
              name: 'sort_index',
              type: 'int',
              default: 0,
            },
            {
              name: 'decision',
              type: 'enum',
              enum: ['pending', 'approve', 'reject', 'timeout'],
              default: "'pending'",
            },
            {
              name: 'assigned_at',
              type: 'timestamp',
              precision: 6,
              default: 'CURRENT_TIMESTAMP(6)',
            },
            {
              name: 'expires_at',
              type: 'timestamp',
              precision: 6,
            },
            {
              name: 'decided_at',
              type: 'timestamp',
              precision: 6,
              isNullable: true,
            },
            {
              name: 'created_at',
              type: 'timestamp',
              precision: 6,
              default: 'CURRENT_TIMESTAMP(6)',
            },
            {
              name: 'updated_at',
              type: 'timestamp',
              precision: 6,
              default: 'CURRENT_TIMESTAMP(6)',
              onUpdate: 'CURRENT_TIMESTAMP(6)',
            },
            {
              name: 'deleted_at',
              type: 'timestamp',
              precision: 6,
              isNullable: true,
            },
          ],
        }),
        true,
      );

      await queryRunner.createForeignKey(
        'campaign_proposal_assignments',
        new TableForeignKey({
          columnNames: ['proposal_id'],
          referencedTableName: 'campaign_proposals',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );

      await queryRunner.createForeignKey(
        'campaign_proposal_assignments',
        new TableForeignKey({
          columnNames: ['donor_user_id'],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );

      await queryRunner.createIndex(
        'campaign_proposal_assignments',
        new TableIndex({
          name: 'idx_cpa_proposal',
          columnNames: ['proposal_id'],
        }),
      );

      await queryRunner.createIndex(
        'campaign_proposal_assignments',
        new TableIndex({
          name: 'idx_cpa_pending_expiry',
          columnNames: ['decision', 'expires_at'],
        }),
      );
    }

    const proposals = await queryRunner.getTable('campaign_proposals');
    const newCols: TableColumn[] = [];
    if (!proposals?.findColumnByName('current_assignment_id')) {
      newCols.push(
        new TableColumn({
          name: 'current_assignment_id',
          type: 'varchar',
          length: '36',
          isNullable: true,
        }),
      );
    }
    if (!proposals?.findColumnByName('assignment_expires_at')) {
      newCols.push(
        new TableColumn({
          name: 'assignment_expires_at',
          type: 'timestamp',
          precision: 6,
          isNullable: true,
        }),
      );
    }
    if (!proposals?.findColumnByName('picked_donor_ids_json')) {
      newCols.push(
        new TableColumn({
          name: 'picked_donor_ids_json',
          type: 'json',
          isNullable: true,
        }),
      );
    }
    if (!proposals?.findColumnByName('rejection_reason')) {
      newCols.push(
        new TableColumn({
          name: 'rejection_reason',
          type: 'varchar',
          length: '64',
          isNullable: true,
        }),
      );
    }
    if (newCols.length) {
      await queryRunner.addColumns('campaign_proposals', newCols);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const proposals = await queryRunner.getTable('campaign_proposals');
    for (const colName of [
      'current_assignment_id',
      'assignment_expires_at',
      'picked_donor_ids_json',
      'rejection_reason',
    ]) {
      if (proposals?.findColumnByName(colName)) {
        await queryRunner.dropColumn('campaign_proposals', colName);
      }
    }
    if (await queryRunner.getTable('campaign_proposal_assignments')) {
      await queryRunner.dropTable('campaign_proposal_assignments');
    }
  }
}
