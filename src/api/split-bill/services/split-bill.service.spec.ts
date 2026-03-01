import { Test, TestingModule } from '@nestjs/testing';
import { SplitBillService } from './split-bill.service';

describe('SplitBillService', () => {
  let service: SplitBillService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SplitBillService],
    }).compile();

    service = module.get<SplitBillService>(SplitBillService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
