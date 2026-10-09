import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { FakeKybProvider } from './fake-kyb.provider';
import { RiskCheck } from './risk-check.entity';
import { MERCHANT_RISK_QUEUE } from './risk-job';
import { RiskOutboxDispatcher } from './risk-outbox.dispatcher';
import { RiskOutbox } from './risk-outbox.entity';
import { RiskProcessingService } from './risk-processing.service';
import { RiskWorker } from './risk.worker';

@Module({
  imports: [
    AuditModule,
    TypeOrmModule.forFeature([RiskCheck, RiskOutbox]),
    BullModule.registerQueue({ name: MERCHANT_RISK_QUEUE }),
  ],
  providers: [
    FakeKybProvider,
    RiskProcessingService,
    RiskOutboxDispatcher,
    RiskWorker,
  ],
  exports: [RiskOutboxDispatcher, RiskProcessingService],
})
export class RiskModule {}
