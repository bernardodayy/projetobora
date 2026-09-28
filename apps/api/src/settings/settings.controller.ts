import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { SettingsService } from './settings.service';
import { UpdateSistemaDto } from './dto/update-sistema.dto';
import { UpdateDespachoDto } from './dto/update-despacho.dto';
import { UpdateNotificacoesDto } from './dto/update-notificacoes.dto';

@Controller('configuracoes')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @RequirePermissions('configuracoes.visualizar')
  getAll() {
    return this.settingsService.getAll();
  }

  @Get('integracoes')
  @RequirePermissions('configuracoes.visualizar')
  getIntegrations() {
    return this.settingsService.getIntegrationsStatus();
  }

  @Patch('sistema')
  @RequirePermissions('configuracoes.editar')
  updateSistema(@Body() dto: UpdateSistemaDto, @CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.updateSection('sistema', dto, user.sub);
  }

  @Patch('despacho')
  @RequirePermissions('configuracoes.editar')
  updateDespacho(@Body() dto: UpdateDespachoDto, @CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.updateSection('despacho', dto, user.sub);
  }

  @Patch('notificacoes')
  @RequirePermissions('configuracoes.editar')
  updateNotificacoes(@Body() dto: UpdateNotificacoesDto, @CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.updateSection('notificacoes', dto, user.sub);
  }
}
