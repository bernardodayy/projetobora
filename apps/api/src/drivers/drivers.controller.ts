import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { DriversService } from './drivers.service';
import { paging } from '../common/pagination';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { ReasonDto } from './dto/reason.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { SetPasswordDto } from './dto/set-password.dto';

@Controller('drivers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Get()
  @RequirePermissions('motoristas.visualizar')
  findAll(
    @Query('status') status?: string,
    @Query('availability') availability?: string,
    @Query('name') name?: string,
    @Query('cpf') cpf?: string,
    @Query('plate') plate?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.driversService.findAll({ status, availability, name, cpf, plate }, paging(page, pageSize));
  }

  @Get(':id')
  @RequirePermissions('motoristas.visualizar')
  findOne(@Param('id') id: string) {
    return this.driversService.findOne(id);
  }

  @Post()
  @RequirePermissions('motoristas.editar')
  create(@Body() dto: CreateDriverDto, @CurrentUser() user: AuthenticatedUser) {
    return this.driversService.create(dto, user.sub);
  }

  @Patch(':id')
  @RequirePermissions('motoristas.editar')
  update(@Param('id') id: string, @Body() dto: UpdateDriverDto, @CurrentUser() user: AuthenticatedUser) {
    return this.driversService.update(id, dto, user.sub);
  }

  @Post(':id/approve')
  @RequirePermissions('motoristas.aprovar')
  approve(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.driversService.approve(id, user.sub);
  }

  @Post(':id/reject')
  @RequirePermissions('motoristas.aprovar')
  reject(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() user: AuthenticatedUser) {
    return this.driversService.reject(id, dto, user.sub);
  }

  @Post(':id/request-correction')
  @RequirePermissions('motoristas.aprovar')
  requestCorrection(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() user: AuthenticatedUser) {
    return this.driversService.requestCorrection(id, dto, user.sub);
  }

  @Post(':id/block')
  @RequirePermissions('motoristas.bloquear')
  block(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() user: AuthenticatedUser) {
    return this.driversService.block(id, dto, user.sub);
  }

  @Post(':id/unblock')
  @RequirePermissions('motoristas.bloquear')
  unblock(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.driversService.unblock(id, user.sub);
  }

  @Patch(':id/location')
  @RequirePermissions('motoristas.editar')
  updateLocation(@Param('id') id: string, @Body() dto: UpdateLocationDto) {
    return this.driversService.updateLocation(id, dto);
  }

  @Patch(':id/availability')
  @RequirePermissions('motoristas.editar')
  updateAvailability(@Param('id') id: string, @Body() dto: UpdateAvailabilityDto, @CurrentUser() user: AuthenticatedUser) {
    return this.driversService.updateAvailability(id, dto.availability, user.sub);
  }

  @Patch(':id/password')
  @RequirePermissions('motoristas.editar')
  setPassword(@Param('id') id: string, @Body() dto: SetPasswordDto, @CurrentUser() user: AuthenticatedUser) {
    return this.driversService.setPassword(id, dto.password, user.sub);
  }
}
