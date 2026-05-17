import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

// Pending payouts park refund amounts for guests who don't have an
// account yet. When a split bill is cancelled, each unregistered
// participant's paid amount lands in a row here keyed to their phone.
// The participant gets an SMS + WhatsApp invite to sign up; on signup
// the row is consumed and the wallet is credited.
//
// Strictly additive — new table only, no other schemas touched. Safe
// for the shared Aiven DB.
export class AddPendingPayouts1778800000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('pending_payouts');
    if (table) return;

    await queryRunner.createTable(
      new Table({
        name: 'pending_payouts',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          // Normalised phone (digits only, no + or spaces) so the
          // signup-side lookup is deterministic.
          { name: 'phone', type: 'varchar', length: '20' },
          {
            name: 'amount',
            type: 'decimal',
            precision: 14,
            scale: 2,
          },
          { name: 'currency', type: 'varchar', length: '8', default: "'NGN'" },
          {
            name: 'source',
            type: 'enum',
            enum: ['SPLIT_BILL_CANCEL'],
            default: "'SPLIT_BILL_CANCEL'",
          },
          // FK references kept loose (varchar, no FK constraints) so a
          // deleted bill or participant doesn't cascade-delete the
          // payout — the funds still need to settle one way or another.
          { name: 'source_bill_id', type: 'varchar', length: '36' },
          {
            name: 'source_participant_id',
            type: 'varchar',
            length: '36',
            isNullable: true,
          },
          // Who originally paid for this share — money is debited from
          // their wallet on cancel, and returned to them if the payout
          // expires unclaimed.
          {
            name: 'origin_payer_user_id',
            type: 'varchar',
            length: '36',
            isNullable: true,
          },
          // Who created the bill — also a possible return target when a
          // payout expires. Set per project decision (default: return
          // to the original payer's wallet).
          {
            name: 'bill_creator_user_id',
            type: 'varchar',
            length: '36',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['PENDING', 'CLAIMED', 'RETURNED', 'EXPIRED'],
            default: "'PENDING'",
          },
          {
            name: 'expires_at',
            type: 'timestamp',
            precision: 6,
          },
          {
            name: 'claimed_at',
            type: 'timestamp',
            precision: 6,
            isNullable: true,
          },
          {
            name: 'claimed_by_user_id',
            type: 'varchar',
            length: '36',
            isNullable: true,
          },
          {
            name: 'returned_at',
            type: 'timestamp',
            precision: 6,
            isNullable: true,
          },
          // Notification log — `notified_at` is non-null once the
          // first SMS / WhatsApp goes out. `notification_meta` stores
          // last attempt status + Meta message ids for debugging.
          {
            name: 'notified_at',
            type: 'timestamp',
            precision: 6,
            isNullable: true,
          },
          {
            name: 'notification_meta',
            type: 'json',
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

    // Phone is the hot lookup at signup time + the most-asked filter.
    await queryRunner.createIndex(
      'pending_payouts',
      new TableIndex({
        name: 'idx_pending_payouts_phone',
        columnNames: ['phone'],
      }),
    );

    // The expiry cron scans (status = PENDING AND expires_at < now()).
    await queryRunner.createIndex(
      'pending_payouts',
      new TableIndex({
        name: 'idx_pending_payouts_status_expires',
        columnNames: ['status', 'expires_at'],
      }),
    );

    // claimedByUserId surfaces on the user's wallet history for
    // "you received ₦X waiting from a previous bill" lookups.
    await queryRunner.createIndex(
      'pending_payouts',
      new TableIndex({
        name: 'idx_pending_payouts_claimed_by',
        columnNames: ['claimed_by_user_id'],
      }),
    );
    // Silence unused-import lint in case TableForeignKey isn't used.
    void TableForeignKey;
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.getTable('pending_payouts')) {
      await queryRunner.dropTable('pending_payouts');
    }
  }
}
