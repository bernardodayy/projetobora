import { Module } from '@nestjs/common';
import { RidesService } from './rides.service';
import { RidesController } from './rides.controller';
import { AuditModule } from '../audit/audit.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { PricingModule } from '../pricing/pricing.module';
import { FinanceiroModule } from '../financeiro/financeiro.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { CouponsModule } from '../coupons/coupons.module';

@Module({
  imports: [AuditModule, RealtimeModule, PricingModule, FinanceiroModule, NotificationsModule, SettingsModule, CouponsModule],
  controllers: [RidesController],
  providers: [RidesService],
  exports: [RidesService],
})
export class RidesModule {}
