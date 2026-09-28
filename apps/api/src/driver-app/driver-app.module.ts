import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DriversModule } from '../drivers/drivers.module';
import { RidesModule } from '../rides/rides.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DriverAuthService } from './driver-auth.service';
import { DriverAppService } from './driver-app.service';
import { DriverAppController } from './driver-app.controller';
import { DriverJwtStrategy } from './strategies/driver-jwt.strategy';

@Module({
  imports: [
    DriversModule,
    RidesModule,
    NotificationsModule,
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
  controllers: [DriverAppController],
  providers: [DriverAuthService, DriverAppService, DriverJwtStrategy],
})
export class DriverAppModule {}
