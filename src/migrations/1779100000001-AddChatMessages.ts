import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

// Minimal one-on-one chat backing table. No conversation/thread entity
// (yet) — every message belongs to a single (sender, recipient) pair,
// and a "conversation" is just the union of messages where the
// (smaller, larger) user-id pair matches. Keeps the schema flat for
// the MVP; we can add a threads table later when we need read
// receipts, typing indicators, or last-seen markers per thread.
//
// Strictly additive: brand-new table, no touch to existing schemas.
export class AddChatMessages1779100000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing = await queryRunner.getTable('chat_messages');
    if (existing) return;

    await queryRunner.createTable(
      new Table({
        name: 'chat_messages',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'sender_id', type: 'varchar', length: '36' },
          { name: 'recipient_id', type: 'varchar', length: '36' },
          { name: 'body', type: 'text' },
          {
            name: 'read_at',
            type: 'timestamp',
            precision: 6,
            isNullable: true,
          },
          {
            name: 'deleted_at',
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
        ],
      }),
      true,
    );

    // Two indexes that cover the two directions of the listConversation
    // query (`WHERE sender = A AND recipient = B OR sender = B AND
    // recipient = A ORDER BY created_at`).
    await queryRunner.createIndex(
      'chat_messages',
      new TableIndex({
        name: 'idx_chat_messages_sender_recipient_created',
        columnNames: ['sender_id', 'recipient_id', 'created_at'],
      }),
    );
    await queryRunner.createIndex(
      'chat_messages',
      new TableIndex({
        name: 'idx_chat_messages_recipient_sender_created',
        columnNames: ['recipient_id', 'sender_id', 'created_at'],
      }),
    );
    // Recipient-side inbox query (unread bubbles) hits this one.
    await queryRunner.createIndex(
      'chat_messages',
      new TableIndex({
        name: 'idx_chat_messages_recipient_read',
        columnNames: ['recipient_id', 'read_at'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.getTable('chat_messages')) {
      await queryRunner.dropTable('chat_messages');
    }
  }
}
