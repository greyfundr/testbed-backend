import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class AddProposalsAndVendors1777500000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Approval threshold columns on campaigns
    await queryRunner.addColumns('campaigns', [
      new TableColumn({
        name: 'approval_threshold_mode',
        type: 'enum',
        enum: ['auto', 'manual'],
        default: "'auto'",
      }),
      new TableColumn({
        name: 'approval_threshold_count',
        type: 'int',
        isNullable: true,
      }),
    ]);

    // 2. campaign_vendors
    await queryRunner.createTable(
      new Table({
        name: 'campaign_vendors',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'campaign_id', type: 'varchar', length: '36' },
          { name: 'name', type: 'varchar', length: '120' },
          {
            name: 'kind',
            type: 'enum',
            enum: ['vendor', 'individual', 'internal'],
            default: "'vendor'",
          },
          {
            name: 'bank_name',
            type: 'varchar',
            length: '120',
            isNullable: true,
          },
          {
            name: 'account_name',
            type: 'varchar',
            length: '120',
            isNullable: true,
          },
          {
            name: 'account_number',
            type: 'varchar',
            length: '32',
            isNullable: true,
          },
          {
            name: 'contact',
            type: 'varchar',
            length: '120',
            isNullable: true,
          },
          { name: 'notes', type: 'text', isNullable: true },
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
      'campaign_vendors',
      new TableForeignKey({
        columnNames: ['campaign_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'campaigns',
        onDelete: 'CASCADE',
      }),
    );
    await queryRunner.createIndex(
      'campaign_vendors',
      new TableIndex({
        name: 'IDX_campaign_vendors_campaign',
        columnNames: ['campaign_id'],
      }),
    );

    // 3. campaign_proposals
    await queryRunner.createTable(
      new Table({
        name: 'campaign_proposals',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'campaign_id', type: 'varchar', length: '36' },
          { name: 'proposer_id', type: 'varchar', length: '36' },
          { name: 'title', type: 'varchar', length: '200' },
          { name: 'purpose', type: 'text', isNullable: true },
          {
            name: 'vendor_id',
            type: 'varchar',
            length: '36',
            isNullable: true,
          },
          {
            name: 'total_amount',
            type: 'decimal',
            precision: 20,
            scale: 2,
            default: 0,
          },
          {
            name: 'status',
            type: 'enum',
            enum: [
              'pending',
              'approved',
              'rejected',
              'executed',
              'cancelled',
            ],
            default: "'pending'",
          },
          { name: 'required_approvals', type: 'int' },
          { name: 'votes_for', type: 'int', default: 0 },
          { name: 'votes_against', type: 'int', default: 0 },
          {
            name: 'decided_at',
            type: 'timestamp',
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
    await queryRunner.createForeignKeys('campaign_proposals', [
      new TableForeignKey({
        columnNames: ['campaign_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'campaigns',
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['proposer_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'RESTRICT',
      }),
      new TableForeignKey({
        columnNames: ['vendor_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'campaign_vendors',
        onDelete: 'SET NULL',
      }),
    ]);
    await queryRunner.createIndex(
      'campaign_proposals',
      new TableIndex({
        name: 'IDX_campaign_proposals_campaign',
        columnNames: ['campaign_id'],
      }),
    );
    await queryRunner.createIndex(
      'campaign_proposals',
      new TableIndex({
        name: 'IDX_campaign_proposals_status',
        columnNames: ['status'],
      }),
    );

    // 4. campaign_proposal_allocations
    await queryRunner.createTable(
      new Table({
        name: 'campaign_proposal_allocations',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'proposal_id', type: 'varchar', length: '36' },
          {
            name: 'budget_ref',
            type: 'varchar',
            length: '64',
            isNullable: true,
          },
          { name: 'label', type: 'varchar', length: '200' },
          {
            name: 'amount',
            type: 'decimal',
            precision: 20,
            scale: 2,
            default: 0,
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
      'campaign_proposal_allocations',
      new TableForeignKey({
        columnNames: ['proposal_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'campaign_proposals',
        onDelete: 'CASCADE',
      }),
    );
    await queryRunner.createIndex(
      'campaign_proposal_allocations',
      new TableIndex({
        name: 'IDX_proposal_allocations_proposal',
        columnNames: ['proposal_id'],
      }),
    );

    // 5. campaign_proposal_votes
    await queryRunner.createTable(
      new Table({
        name: 'campaign_proposal_votes',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'proposal_id', type: 'varchar', length: '36' },
          { name: 'voter_id', type: 'varchar', length: '36' },
          {
            name: 'vote',
            type: 'enum',
            enum: ['approve', 'reject'],
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
    await queryRunner.createForeignKeys('campaign_proposal_votes', [
      new TableForeignKey({
        columnNames: ['proposal_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'campaign_proposals',
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['voter_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    ]);
    await queryRunner.createIndex(
      'campaign_proposal_votes',
      new TableIndex({
        name: 'UQ_proposal_voter',
        columnNames: ['proposal_id', 'voter_id'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('campaign_proposal_votes');
    await queryRunner.dropTable('campaign_proposal_allocations');
    await queryRunner.dropTable('campaign_proposals');
    await queryRunner.dropTable('campaign_vendors');
    await queryRunner.dropColumns('campaigns', [
      'approval_threshold_count',
      'approval_threshold_mode',
    ]);
  }
}
