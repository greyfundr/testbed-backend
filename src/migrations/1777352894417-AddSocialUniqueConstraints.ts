import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class AddSocialUniqueConstraints1777352894417 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add unique index to friend_requests
    await queryRunner.createIndex(
      'friend_requests',
      new TableIndex({
        name: 'UQ_friend_request_sender_receiver',
        columnNames: ['sender_id', 'receiver_id'],
        isUnique: true,
      }),
    );

    // Add unique index to follows
    await queryRunner.createIndex(
      'follows',
      new TableIndex({
        name: 'UQ_follow_follower_following',
        columnNames: ['follower_id', 'following_id'],
        isUnique: true,
      }),
    );

    // Add unique index to blocks
    await queryRunner.createIndex(
      'blocks',
      new TableIndex({
        name: 'UQ_block_blocker_blocked',
        columnNames: ['blocker_id', 'blocked_id'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      'friend_requests',
      'UQ_friend_request_sender_receiver',
    );
    await queryRunner.dropIndex('follows', 'UQ_follow_follower_following');
    await queryRunner.dropIndex('blocks', 'UQ_block_blocker_blocked');
  }
}
