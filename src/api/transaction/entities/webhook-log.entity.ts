import { Entity, Column, Index } from 'typeorm';
import { AbstractEntity } from '../../../common/entities';

@Entity('webhook_logs')
@Index(['event'])
@Index(['gatewayReference'])
export class WebhookLog extends AbstractEntity {
  @Column()
  event: string;

  @Column({ name: 'gateway_reference' })
  gatewayReference: string;

  @Column({ type: 'json' })
  payload: Record<string, any>;

  @Column({ default: false, name: 'is_processed' })
  isProcessed: boolean;

  @Column({ type: 'text', nullable: true, name: 'processing_error' })
  processingError: string | null;

  @Column({ type: 'int', default: 0, name: 'retry_count' })
  retryCount: number;

  @Column({ type: 'timestamp', nullable: true, name: 'processed_at' })
  processedAt: Date | null;
}
