import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { AuditModule } from './audit/audit.module';
import { CustomersModule } from './customers/customers.module';
import { DriversModule } from './drivers/drivers.module';
import { RidesModule } from './rides/rides.module';
import { RealtimeModule } from './realtime/realtime.module';
import { PricingModule } from './pricing/pricing.module';
import { FinanceiroModule } from './financeiro/financeiro.module';
import { SettingsModule } from './settings/settings.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DriverAppModule } from './driver-app/driver-app.module';
import { CustomerAppModule } from './customer-app/customer-app.module';
import { CouponsModule } from './coupons/coupons.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    RolesModule,
    AuditModule,
    CustomersModule,
    DriversModule,
    RidesModule,
    RealtimeModule,
    PricingModule,
    FinanceiroModule,
    SettingsModule,
    NotificationsModule,
    DriverAppModule,
    CustomerAppModule,
    CouponsModule,
    DashboardModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
