import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CustomersModule } from '../customers/customers.module';
import { RidesModule } from '../rides/rides.module';
import { PricingModule } from '../pricing/pricing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CouponsModule } from '../coupons/coupons.module';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerAppService } from './customer-app.service';
import { CustomerAppController } from './customer-app.controller';
import { CustomerJwtStrategy } from './strategies/customer-jwt.strategy';

@Module({
  imports: [
    CustomersModule,
    RidesModule,
    PricingModule,
    NotificationsModule,
    CouponsModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_ACCESS_EXPIRES_IN') },
      }),
    }),
  ],
  controllers: [CustomerAppController],
  providers: [CustomerAuthService, CustomerAppService, CustomerJwtStrategy],
})
export class CustomerAppModule {}
