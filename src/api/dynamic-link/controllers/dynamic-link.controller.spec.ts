import { Test, TestingModule } from '@nestjs/testing';
import { DynamicLinkController } from './dynamic-link.controller';

describe('DynamicLinkController', () => {
  let controller: DynamicLinkController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DynamicLinkController],
    }).compile();

    controller = module.get<DynamicLinkController>(DynamicLinkController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
