import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { PricingConfigService } from './pricing-config.service';
import { PricingEngineService } from './pricing-engine.service';
import { UpdatePricingConfigDto } from './dto/update-config.dto';
import { SimulateDto } from './dto/simulate.dto';

@Controller('pricing')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PricingController {
  constructor(
    private readonly configService: PricingConfigService,
    private readonly engine: PricingEngineService,
  ) {}

  @Get('config')
  @RequirePermissions('tarifas.visualizar')
  async getConfig() {
    return this.configService.getActive();
  }

  @Patch('config')
  @RequirePermissions('tarifas.editar')
  async updateConfig(@Body() dto: UpdatePricingConfigDto, @CurrentUser() user: AuthenticatedUser) {
    return this.configService.update(dto, user.sub);
  }

  @Get('config/history')
  @RequirePermissions('tarifas.visualizar')
  async getHistory() {
    const config = await this.configService.getActive();
    return this.configService.getHistory(config.id);
  }

  @Post('simulate')
  @RequirePermissions('tarifas.visualizar')
  simulate(@Body() dto: SimulateDto) {
    return this.engine.calculate(
      { lat: dto.originLat, lng: dto.originLng },
      { lat: dto.destinationLat, lng: dto.destinationLng },
      dto.at ? new Date(dto.at) : new Date(),
    );
  }
}
