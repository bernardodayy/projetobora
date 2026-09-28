import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PricingController } from './pricing.controller';
import { PricingZonesController } from './pricing-zones.controller';
import { PricingSchedulesController } from './pricing-schedules.controller';
import { PricingConfigService } from './pricing-config.service';
import { PricingZonesService } from './pricing-zones.service';
import { PricingSchedulesService } from './pricing-schedules.service';
import { PricingEngineService } from './pricing-engine.service';
import { DistanceService } from './distance.service';

@Module({
  imports: [AuditModule],
  controllers: [PricingController, PricingZonesController, PricingSchedulesController],
  providers: [PricingConfigService, PricingZonesService, PricingSchedulesService, PricingEngineService, DistanceService],
  exports: [PricingEngineService],
})
export class PricingModule {}
