import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { BrandingController } from './branding.controller';
import { DeveloperController } from './developer.controller';

@Module({
  imports: [AuditModule],
  controllers: [SettingsController, BrandingController, DeveloperController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
