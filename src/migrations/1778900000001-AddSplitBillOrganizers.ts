import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

// Split-bill organisers — mirrors the campaign organisers table so the
// invite / accept / reject flow works the same way on bills. Strictly
// additive: brand-new table only, no other schemas touched.
//
// Public rail surfaces only ACCEPTED rows; PENDING rows live until the
// invitee responds, REJECTED rows stay for audit but are hidden.
// Free-form rows (no linked userId) are auto-accepted on create — same
// short-circuit as campaigns so a creator can add a known-by-name
// helper without waiting for them to sign up.
export class AddSplitBillOrganizers1778900000001
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing = await queryRunner.getTable('split_bill_organizers');
    if (existing) return;

    await queryRunner.createTable(
      new Table({
        name: 'split_bill_organizers',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          // FK reference kept loose (varchar, no FK constraint) so a
          // deleted bill doesn't cascade-delete the audit row.
          { name: 'split_bill_id', type: 'varchar', length: '36' },
          {
            name: 'user_id',
            type: 'varchar',
            length: '36',
            isNullable: true,
          },
          { name: 'display_name', type: 'varchar', length: '150' },
          {
            name: 'role',
            type: 'varchar',
            length: '200',
            default: "'Organiser'",
          },
          {
            name: 'avatar_url',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'invitation_status',
            type: 'enum',
            enum: ['pending', 'accepted', 'rejected'],
            default: "'accepted'",
          },
          {
            name: 'responded_at',
            type: 'timestamp',
            precision: 6,
            isNullable: true,
          },
          {
            name: 'rejection_reason',
            type: 'text',
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
        ],
      }),
      true,
    );

    // The Manage Organisers sheet + public rail both query by bill id.
    await queryRunner.createIndex(
      'split_bill_organizers',
      new TableIndex({
        name: 'idx_split_bill_organizers_bill',
        columnNames: ['split_bill_id'],
      }),
    );

    // The invitee inbox query is "every PENDING row addressed to me",
    // so the composite (user_id, invitation_status) wins on both the
    // listInvitations call and the duplicate-invite check in create().
    await queryRunner.createIndex(
      'split_bill_organizers',
      new TableIndex({
        name: 'idx_split_bill_organizers_user_status',
        columnNames: ['user_id', 'invitation_status'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.getTable('split_bill_organizers')) {
      await queryRunner.dropTable('split_bill_organizers');
    }
  }
}
