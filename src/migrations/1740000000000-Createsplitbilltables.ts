import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
  TableForeignKey,
} from 'typeorm';

/**
 * Migration: CreateSplitBillTables — MySQL-compatible version
 *
 * MySQL-specific fixes applied vs the original:
 *
 * 1. UUID columns → varchar(36)
 *    MySQL has no native UUID type. TypeORM emits uuid(36) which is a syntax
 *    error. varchar(36) is what TypeORM uses internally when it generates
 *    migrations from entities on a MySQL driver.
 *
 * 2. No DEFAULT uuid_generate_v4() / UUID()
 *    MySQL 8.0.13+ supports DEFAULT (UUID()) in parentheses, but earlier
 *    versions do not. TypeORM generates UUIDs at the application layer (via
 *    uuid package) before the INSERT, so the column needs no DB-level default.
 *    Leaving the default out is the correct, version-safe approach.
 *
 * 3. No partial / conditional indexes
 *    MySQL does not support CREATE INDEX ... WHERE (partial indexes).
 *    The unique constraint "same user can't appear twice on one bill" is
 *    enforced at the application layer (SplitBillService) instead.
 *    A regular composite index on (split_bill_id, user_id) is created for
 *    query performance; uniqueness is application-enforced.
 *
 * 4. json type — MySQL 5.7.8+ supports it natively — no change needed.
 *
 * 5. boolean → tinyint(1) — MySQL's canonical boolean storage.
 *
 * 6. All FKs reference varchar(36) columns consistently.
 */
export class CreateSplitBillTables1740000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. split_bills ────────────────────────────────────────────────────────
    await queryRunner.createTable(
      new Table({
        name: 'split_bills',
        columns: [
          // ── Identity ──────────────────────────────────────────────────────
          {
            // varchar(36) not uuid — MySQL has no uuid column type.
            // TypeORM generates the UUID in JS (uuid package) before INSERT.
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
            isNullable: false,
          },

          // ── Metadata ──────────────────────────────────────────────────────
          {
            name: 'title',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'image_url',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'bill_receipt',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },

          // ── Amounts (BIGINT = kobo) ────────────────────────────────────────
          {
            name: 'total_amount',
            type: 'bigint',
            isNullable: false,
            comment:
              'Total bill amount in kobo. SUM(participants.amount_owed) must equal this.',
          },
          {
            name: 'total_collected',
            type: 'bigint',
            isNullable: false,
            default: '0',
            comment:
              'Running total collected from all participants (kobo). Updated atomically on each payment.',
          },
          {
            name: 'currency',
            type: 'varchar',
            length: '3',
            isNullable: false,
            default: "'NGN'",
          },

          // ── Split configuration ────────────────────────────────────────────
          {
            name: 'split_method',
            type: 'varchar',
            length: '20',
            isNullable: false,
            default: "'EVEN'",
            comment: 'EVEN | MANUAL | PERCENTAGE',
          },
          {
            // tinyint(1) is MySQL's canonical boolean storage (not the boolean keyword)
            name: 'is_finalized',
            type: 'tinyint',
            width: 1,
            isNullable: false,
            default: '0',
            comment:
              'Once true, no further participant or amount changes are allowed.',
          },
          {
            name: 'finalized_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'allow_partial_payment',
            type: 'tinyint',
            width: 1,
            isNullable: false,
            default: '1',
          },
          {
            name: 'min_payment_amount',
            type: 'bigint',
            isNullable: true,
            comment:
              'Minimum single payment in kobo. Guards against micro-payment spam.',
          },

          // ── Participant counters ───────────────────────────────────────────
          {
            name: 'total_participants',
            type: 'int',
            isNullable: false,
            default: '0',
          },
          {
            name: 'total_paid_participants',
            type: 'int',
            isNullable: false,
            default: '0',
          },

          // ── Status & lifecycle ─────────────────────────────────────────────
          {
            name: 'status',
            type: 'varchar',
            length: '30',
            isNullable: false,
            default: "'draft'",
            comment:
              'draft | active | partially_paid | funded | settled | cancelled | disputed',
          },
          {
            name: 'due_date',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'cancelled_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'cancellation_reason',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'disputed_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'dispute_reason',
            type: 'text',
            isNullable: true,
          },

          // ── Settlement ─────────────────────────────────────────────────────
          {
            name: 'recipient_user_id',
            type: 'varchar',
            length: '36',
            isNullable: true,
            comment:
              'The GreyFundr user who receives settled funds. Usually the creator.',
          },

          // ── Source reference (polymorphic) ─────────────────────────────────
          {
            name: 'source_bill_type',
            type: 'varchar',
            length: '20',
            isNullable: true,
            comment: 'invoice | campaign | request | manual',
          },
          {
            name: 'source_bill_id',
            type: 'varchar',
            length: '36',
            isNullable: true,
          },

          // ── Visibility ─────────────────────────────────────────────────────
          {
            name: 'visibility',
            type: 'varchar',
            length: '20',
            isNullable: false,
            default: "'private'",
            comment: 'public | private | semi_private',
          },

          // ── Reminders ──────────────────────────────────────────────────────
          {
            name: 'reminder_sent_count',
            type: 'int',
            isNullable: false,
            default: '0',
          },
          {
            name: 'last_reminder_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'reminder_days_before',
            type: 'int',
            isNullable: true,
            comment:
              'Auto-reminder N days before due_date. Null = manual reminders only.',
          },

          // ── Ownership ──────────────────────────────────────────────────────
          {
            name: 'creator_id',
            type: 'varchar',
            length: '36',
            isNullable: false,
            comment: 'FK → users.id',
          },

          // ── Timestamps ─────────────────────────────────────────────────────
          {
            name: 'created_at',
            type: 'timestamp',
            isNullable: false,
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            isNullable: false,
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'deleted_at',
            type: 'timestamp',
            isNullable: true,
            comment: 'Soft delete. NULL = active record.',
          },
        ],
      }),
      true,
    );

    // ── split_bills indexes ───────────────────────────────────────────────────
    await queryRunner.createIndex(
      'split_bills',
      new TableIndex({
        name: 'IDX_split_bills_creator_status',
        columnNames: ['creator_id', 'status'],
      }),
    );

    await queryRunner.createIndex(
      'split_bills',
      new TableIndex({
        name: 'IDX_split_bills_status_due_date',
        columnNames: ['status', 'due_date'],
      }),
    );

    await queryRunner.createIndex(
      'split_bills',
      new TableIndex({
        name: 'IDX_split_bills_source',
        columnNames: ['source_bill_type', 'source_bill_id'],
      }),
    );

    await queryRunner.createIndex(
      'split_bills',
      new TableIndex({
        name: 'IDX_split_bills_recipient',
        columnNames: ['recipient_user_id'],
      }),
    );

    await queryRunner.createIndex(
      'split_bills',
      new TableIndex({
        name: 'IDX_split_bills_deleted_at',
        columnNames: ['deleted_at'],
      }),
    );

    // FK: creator_id → users.id
    // RESTRICT — a user cannot be deleted while they are a bill creator.
    await queryRunner.createForeignKey(
      'split_bills',
      new TableForeignKey({
        name: 'FK_split_bills_creator',
        columnNames: ['creator_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      }),
    );

    // ── 2. split_bill_participants ────────────────────────────────────────────
    await queryRunner.createTable(
      new Table({
        name: 'split_bill_participants',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
            isNullable: false,
          },

          // ── Bill reference ─────────────────────────────────────────────────
          {
            name: 'split_bill_id',
            type: 'varchar',
            length: '36',
            isNullable: false,
          },

          // ── Participant identity ───────────────────────────────────────────
          // Either user_id (registered) OR guest_* fields. Never both.
          {
            name: 'user_id',
            type: 'varchar',
            length: '36',
            isNullable: true,
            comment: 'NULL for guest participants.',
          },
          {
            name: 'guest_name',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'guest_phone',
            type: 'varchar',
            length: '20',
            isNullable: true,
          },
          {
            name: 'guest_email',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },

          // ── Role ───────────────────────────────────────────────────────────
          {
            name: 'role',
            type: 'varchar',
            length: '20',
            isNullable: false,
            default: "'participant'",
            comment: 'creator | participant | recipient',
          },

          // ── Amounts (BIGINT = kobo) ────────────────────────────────────────
          {
            name: 'amount_owed',
            type: 'bigint',
            isNullable: false,
            default: '0',
          },
          {
            name: 'amount_paid',
            type: 'bigint',
            isNullable: false,
            default: '0',
          },
          {
            // Stored (not computed) so it can be indexed and queried directly.
            // Invariant: amount_remaining = amount_owed + balance_adjustment - amount_paid
            // Service maintains this on every payment.
            name: 'amount_remaining',
            type: 'bigint',
            isNullable: false,
            default: '0',
          },
          {
            name: 'balance_adjustment',
            type: 'bigint',
            isNullable: false,
            default: '0',
            comment:
              'Creator-applied kobo adjustment. Negative = discount; positive = surcharge.',
          },
          {
            // INT not FLOAT — no floating point in financial fields.
            name: 'percentage',
            type: 'int',
            isNullable: true,
            comment:
              'Used only when split_method = PERCENTAGE. Whole number 0-100.',
          },

          // ── Status ─────────────────────────────────────────────────────────
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            isNullable: false,
            default: "'INVITED'",
            comment:
              'INVITED | ACCEPTED | DECLINED | UNPAID | PARTIAL | PAID | WAIVED',
          },

          // ── Invite / access ────────────────────────────────────────────────
          {
            name: 'invite_code',
            type: 'varchar',
            length: '12',
            isNullable: true,
          },
          {
            name: 'invite_expires_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'payment_link',
            type: 'varchar',
            length: '500',
            isNullable: true,
            comment:
              'Short-lived Paystack payment link for guest participants.',
          },
          {
            name: 'payment_link_expires_at',
            type: 'timestamp',
            isNullable: true,
          },

          // ── Wallet link ────────────────────────────────────────────────────
          {
            name: 'wallet_id',
            type: 'varchar',
            length: '36',
            isNullable: true,
            comment: 'Wallet used for payment. NULL for guests.',
          },
          {
            name: 'payment_method',
            type: 'varchar',
            length: '20',
            isNullable: true,
            comment: 'wallet | card | bank_transfer',
          },

          // ── Lifecycle timestamps ───────────────────────────────────────────
          {
            name: 'invited_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'accepted_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'declined_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'first_paid_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'fully_paid_at',
            type: 'timestamp',
            isNullable: true,
          },

          // ── Reminders ──────────────────────────────────────────────────────
          {
            name: 'reminder_count',
            type: 'int',
            isNullable: false,
            default: '0',
          },
          {
            name: 'last_reminded_at',
            type: 'timestamp',
            isNullable: true,
          },

          // ── Misc ───────────────────────────────────────────────────────────
          {
            name: 'note',
            type: 'text',
            isNullable: true,
          },

          // ── Timestamps ─────────────────────────────────────────────────────
          {
            name: 'created_at',
            type: 'timestamp',
            isNullable: false,
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            isNullable: false,
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'deleted_at',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // ── split_bill_participants indexes ───────────────────────────────────────

    // invite_code — globally unique across all bills
    await queryRunner.createIndex(
      'split_bill_participants',
      new TableIndex({
        name: 'IDX_sbp_invite_code',
        columnNames: ['invite_code'],
        isUnique: true,
      }),
    );

    // (split_bill_id, user_id) — performance index for "who is on this bill?"
    //
    // NOTE: MySQL does not support partial/conditional indexes (WHERE clauses).
    // The unique constraint "same user cannot appear twice on one bill" is
    // enforced at the application layer in SplitBillService.addParticipant()
    // via an explicit ConflictException check before any INSERT is attempted.
    await queryRunner.createIndex(
      'split_bill_participants',
      new TableIndex({
        name: 'IDX_sbp_bill_user',
        columnNames: ['split_bill_id', 'user_id'],
      }),
    );

    // (split_bill_id, guest_phone) — same note: uniqueness is service-enforced.
    await queryRunner.createIndex(
      'split_bill_participants',
      new TableIndex({
        name: 'IDX_sbp_bill_phone',
        columnNames: ['split_bill_id', 'guest_phone'],
      }),
    );

    await queryRunner.createIndex(
      'split_bill_participants',
      new TableIndex({
        name: 'IDX_sbp_bill_status',
        columnNames: ['split_bill_id', 'status'],
      }),
    );

    await queryRunner.createIndex(
      'split_bill_participants',
      new TableIndex({
        name: 'IDX_sbp_user_status',
        columnNames: ['user_id', 'status'],
      }),
    );

    await queryRunner.createIndex(
      'split_bill_participants',
      new TableIndex({
        name: 'IDX_sbp_amount_remaining',
        columnNames: ['amount_remaining'],
      }),
    );

    await queryRunner.createIndex(
      'split_bill_participants',
      new TableIndex({
        name: 'IDX_sbp_deleted_at',
        columnNames: ['deleted_at'],
      }),
    );

    // FK: split_bill_id → split_bills.id
    // CASCADE — deleting a bill removes its participants.
    await queryRunner.createForeignKey(
      'split_bill_participants',
      new TableForeignKey({
        name: 'FK_sbp_split_bill',
        columnNames: ['split_bill_id'],
        referencedTableName: 'split_bills',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      }),
    );

    // FK: user_id → users.id
    // SET NULL — deleting a user degrades them to a guest-style row,
    // preserving the financial record without breaking the bill.
    await queryRunner.createForeignKey(
      'split_bill_participants',
      new TableForeignKey({
        name: 'FK_sbp_user',
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      }),
    );

    // FK: wallet_id → wallets.id
    // SET NULL — wallet deletion must not break participant records.
    await queryRunner.createForeignKey(
      'split_bill_participants',
      new TableForeignKey({
        name: 'FK_sbp_wallet',
        columnNames: ['wallet_id'],
        referencedTableName: 'wallets',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      }),
    );

    // ── 3. split_bill_activities ──────────────────────────────────────────────
    // Append-only audit log. No updated_at column — rows are never modified.
    await queryRunner.createTable(
      new Table({
        name: 'split_bill_activities',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
            isNullable: false,
          },
          {
            name: 'split_bill_id',
            type: 'varchar',
            length: '36',
            isNullable: false,
          },
          {
            name: 'actor_id',
            type: 'varchar',
            length: '36',
            isNullable: true,
            comment:
              'User who triggered the action. NULL for system-generated events.',
          },
          {
            name: 'participant_id',
            type: 'varchar',
            length: '36',
            isNullable: true,
            comment: 'Set when the event concerns a specific participant.',
          },
          {
            name: 'action_type',
            type: 'varchar',
            length: '50',
            isNullable: false,
            comment:
              'created | updated | cancelled | bill_funded | bill_finalized | ' +
              'payment_made | participant_added | participant_removed | ' +
              'participant_accepted | participant_declined | reminder_sent | settled | disputed',
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          // Kobo snapshots — enables reconstructing payment history without
          // joining to the transactions table.
          {
            name: 'amount_before',
            type: 'bigint',
            isNullable: true,
          },
          {
            name: 'amount_after',
            type: 'bigint',
            isNullable: true,
          },
          {
            name: 'amount_difference',
            type: 'bigint',
            isNullable: true,
          },
          {
            name: 'bill_status_at_time',
            type: 'varchar',
            length: '30',
            isNullable: true,
            comment: 'Snapshot of bill status when this event was recorded.',
          },
          // Soft reference to transactions.id — no FK by design (see end of up()).
          {
            name: 'transaction_id',
            type: 'varchar',
            length: '36',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'json',
            isNullable: true,
          },
          // No updated_at — this table is append-only by design.
          // The absence of the column enforces immutability at the schema level.
          {
            name: 'created_at',
            type: 'timestamp',
            isNullable: false,
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            isNullable: false,
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'deleted_at',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // ── split_bill_activities indexes ─────────────────────────────────────────

    await queryRunner.createIndex(
      'split_bill_activities',
      new TableIndex({
        name: 'IDX_sba_bill_created_at',
        columnNames: ['split_bill_id', 'created_at'],
      }),
    );

    await queryRunner.createIndex(
      'split_bill_activities',
      new TableIndex({
        name: 'IDX_sba_bill_action_type',
        columnNames: ['split_bill_id', 'action_type'],
      }),
    );

    await queryRunner.createIndex(
      'split_bill_activities',
      new TableIndex({
        name: 'IDX_sba_participant_id',
        columnNames: ['participant_id'],
      }),
    );

    await queryRunner.createIndex(
      'split_bill_activities',
      new TableIndex({
        name: 'IDX_sba_transaction_id',
        columnNames: ['transaction_id'],
      }),
    );

    // FK: split_bill_id → split_bills.id
    // CASCADE — deleting a bill removes its audit log.
    await queryRunner.createForeignKey(
      'split_bill_activities',
      new TableForeignKey({
        name: 'FK_sba_split_bill',
        columnNames: ['split_bill_id'],
        referencedTableName: 'split_bills',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      }),
    );

    // No FK on actor_id → users:
    //   System events have NULL actor_id, and user deletion must never
    //   corrupt or block the audit trail.
    //
    // No FK on transaction_id → transactions:
    //   The activity log is a read-side reference only. Transaction lifecycle
    //   is managed independently by the wallet/transaction module.
  }

  // ─── down ─────────────────────────────────────────────────────────────────
  // Drop in reverse dependency order: activities → participants → bills.

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ── split_bill_activities ─────────────────────────────────────────────────
    await queryRunner.dropForeignKey(
      'split_bill_activities',
      'FK_sba_split_bill',
    );
    await queryRunner.dropIndex(
      'split_bill_activities',
      'IDX_sba_bill_created_at',
    );
    await queryRunner.dropIndex(
      'split_bill_activities',
      'IDX_sba_bill_action_type',
    );
    await queryRunner.dropIndex(
      'split_bill_activities',
      'IDX_sba_participant_id',
    );
    await queryRunner.dropIndex(
      'split_bill_activities',
      'IDX_sba_transaction_id',
    );
    await queryRunner.dropTable('split_bill_activities');

    // ── split_bill_participants ───────────────────────────────────────────────
    await queryRunner.dropForeignKey(
      'split_bill_participants',
      'FK_sbp_split_bill',
    );
    await queryRunner.dropForeignKey('split_bill_participants', 'FK_sbp_user');
    await queryRunner.dropForeignKey(
      'split_bill_participants',
      'FK_sbp_wallet',
    );
    await queryRunner.dropIndex(
      'split_bill_participants',
      'IDX_sbp_invite_code',
    );
    await queryRunner.dropIndex('split_bill_participants', 'IDX_sbp_bill_user');
    await queryRunner.dropIndex(
      'split_bill_participants',
      'IDX_sbp_bill_phone',
    );
    await queryRunner.dropIndex(
      'split_bill_participants',
      'IDX_sbp_bill_status',
    );
    await queryRunner.dropIndex(
      'split_bill_participants',
      'IDX_sbp_user_status',
    );
    await queryRunner.dropIndex(
      'split_bill_participants',
      'IDX_sbp_amount_remaining',
    );
    await queryRunner.dropIndex(
      'split_bill_participants',
      'IDX_sbp_deleted_at',
    );
    await queryRunner.dropTable('split_bill_participants');

    // ── split_bills ───────────────────────────────────────────────────────────
    await queryRunner.dropForeignKey('split_bills', 'FK_split_bills_creator');
    await queryRunner.dropIndex(
      'split_bills',
      'IDX_split_bills_creator_status',
    );
    await queryRunner.dropIndex(
      'split_bills',
      'IDX_split_bills_status_due_date',
    );
    await queryRunner.dropIndex('split_bills', 'IDX_split_bills_source');
    await queryRunner.dropIndex('split_bills', 'IDX_split_bills_recipient');
    await queryRunner.dropIndex('split_bills', 'IDX_split_bills_deleted_at');
    await queryRunner.dropTable('split_bills');
  }
}
