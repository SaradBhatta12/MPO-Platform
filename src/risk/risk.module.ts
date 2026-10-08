import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

export const MERCHANT_RISK_QUEUE = 'merchant-risk';

@Module({
  imports: [BullModule.registerQueue({ name: MERCHANT_RISK_QUEUE })],
  exports: [BullModule],
})
export class RiskModule {}
