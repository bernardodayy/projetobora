import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { PricingSchedulesService } from './pricing-schedules.service';
import { CreatePricingScheduleDto } from './dto/create-schedule.dto';
import { UpdatePricingScheduleDto } from './dto/update-schedule.dto';

@Controller('pricing/schedules')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PricingSchedulesController {
  constructor(private readonly schedulesService: PricingSchedulesService) {}

  @Get()
  @RequirePermissions('tarifas.visualizar')
  findAll() {
    return this.schedulesService.findAll();
  }

  @Post()
  @RequirePermissions('tarifas.editar')
  create(@Body() dto: CreatePricingScheduleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.schedulesService.create(dto, user.sub);
  }

  @Patch(':id')
  @RequirePermissions('tarifas.editar')
  update(@Param('id') id: string, @Body() dto: UpdatePricingScheduleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.schedulesService.update(id, dto, user.sub);
  }

  @Delete(':id')
  @RequirePermissions('tarifas.editar')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.schedulesService.remove(id, user.sub);
  }
}
