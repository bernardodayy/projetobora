import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { DEVELOPER_BRAND_PERMISSION } from '../common/developer';
import { SettingsService } from './settings.service';
import { UpdateMarcaDto } from './dto/update-marca.dto';

// Só a equipe de desenvolvimento tem essa permissão (ver common/developer.ts).
@Controller('desenvolvedor/marca')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DeveloperController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @RequirePermissions(DEVELOPER_BRAND_PERMISSION)
  get() {
    return this.settingsService.getBranding();
  }

  @Patch()
  @RequirePermissions(DEVELOPER_BRAND_PERMISSION)
  update(@Body() dto: UpdateMarcaDto, @CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.updateBranding(dto, user.sub);
  }
}
