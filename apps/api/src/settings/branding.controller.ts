import { Controller, Get } from '@nestjs/common';
import { SettingsService } from './settings.service';

// Sem guard de propósito: a tela de login precisa do nome/cor/logo do
// operador antes de qualquer autenticação existir. Só expõe o que é
// seguro mostrar publicamente — nunca as chaves de Integrações.
@Controller('branding')
export class BrandingController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  get() {
    return this.settingsService.getBranding();
  }
}
