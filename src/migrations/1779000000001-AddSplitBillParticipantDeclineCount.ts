import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

// Per-bill, per-participant decline counter — backs the "2 strikes
// and you're out" rule on Manage Participants. Incremented every time
// a participant declines an invite to this bill; once it hits 2, the
// creator can no longer re-invite that user (or re-add them as a new
// participant) to the same bill.
//
// Strictly additive: new nullable column with a default of 0 — every
// existing row reads as "no declines" without backfill.
export class AddSplitBillParticipantDeclineCount1779000000001
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('split_bill_participants');
    if (!table) return;
    const hasColumn = table.columns.some((c) => c.name === 'decline_count');
    if (hasColumn) return;

    await queryRunner.addColumn(
      'split_bill_participants',
      new TableColumn({
        name: 'decline_count',
        type: 'int',
        default: 0,
        unsigned: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('split_bill_participants');
    if (!table) return;
    const hasColumn = table.columns.some((c) => c.name === 'decline_count');
    if (hasColumn) {
      await queryRunner.dropColumn(
        'split_bill_participants',
        'decline_count',
      );
    }
  }
}
