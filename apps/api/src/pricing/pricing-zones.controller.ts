import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { PricingZonesService } from './pricing-zones.service';
import { CreatePricingZoneDto } from './dto/create-zone.dto';
import { UpdatePricingZoneDto } from './dto/update-zone.dto';

@Controller('pricing/zones')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PricingZonesController {
  constructor(private readonly zonesService: PricingZonesService) {}

  @Get()
  @RequirePermissions('zonas.visualizar')
  findAll() {
    return this.zonesService.findAll();
  }

  @Get(':id')
  @RequirePermissions('zonas.visualizar')
  findOne(@Param('id') id: string) {
    return this.zonesService.findOne(id);
  }

  @Post()
  @RequirePermissions('zonas.criar')
  create(@Body() dto: CreatePricingZoneDto, @CurrentUser() user: AuthenticatedUser) {
    return this.zonesService.create(dto, user.sub);
  }

  @Patch(':id')
  @RequirePermissions('zonas.editar')
  update(@Param('id') id: string, @Body() dto: UpdatePricingZoneDto, @CurrentUser() user: AuthenticatedUser) {
    return this.zonesService.update(id, dto, user.sub);
  }

  @Delete(':id')
  @RequirePermissions('zonas.excluir')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.zonesService.remove(id, user.sub);
  }
}
