import { Test, TestingModule } from '@nestjs/testing';
import { DynamicLinkService } from './dynamic-link.service';

describe('DynamicLinkService', () => {
  let service: DynamicLinkService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DynamicLinkService],
    }).compile();

    service = module.get<DynamicLinkService>(DynamicLinkService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
