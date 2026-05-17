import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { SplitBill } from '../entities';
import { SplitBillStatus } from '../enums';

// Hourly cleanup of cancelled bills. The product policy is:
//   - Cancellation marks the row CANCELLED, refunds any paid shares
//     (handled in SplitBillService.cancelBill), and immediately hides
//     the bill from the active home feed.
//   - After a 6-hour grace window the row is soft-deleted so it also
//     disappears from history queries on the user side.
//   - Soft-delete keeps the row in MySQL with `deleted_at` set, so
//     admin queries with `withDeleted: true` still see it for records.
//
// The grace window exists so a creator who cancels by mistake can
// still surface the bill through support before it's hidden from
// participants entirely. We run every hour (not daily) so the actual
// time-to-hide stays close to the configured retention window.
@Injectable()
export class SplitBillRetentionService {
  private readonly logger = new Logger(SplitBillRetentionService.name);
  private static readonly CANCELLED_RETENTION_HOURS = 6;

  constructor(
    @InjectRepository(SplitBill)
    private readonly billRepo: Repository<SplitBill>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async pruneCancelledBills(): Promise<void> {
    const cutoff = new Date(
      Date.now() -
        SplitBillRetentionService.CANCELLED_RETENTION_HOURS * 60 * 60 * 1000,
    );

    try {
      const stale = await this.billRepo.find({
        where: {
          status: SplitBillStatus.CANCELLED,
          cancelledAt: LessThan(cutoff),
        },
        select: ['id'],
      });

      if (stale.length === 0) {
        return;
      }

      const ids = stale.map((b) => b.id);
      await this.billRepo.softDelete(ids);
      this.logger.log(
        `Soft-deleted ${ids.length} cancelled split bill(s) older than ${SplitBillRetentionService.CANCELLED_RETENTION_HOURS} hours.`,
      );
    } catch (err) {
      this.logger.error(
        `Cancelled-bill cleanup failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}
