import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { RidesService } from './rides.service';
import { paging } from '../common/pagination';
import { CreateRideDto } from './dto/create-ride.dto';
import { AssignDriverDto } from './dto/assign-driver.dto';
import { CancelRideDto } from './dto/cancel-ride.dto';
import { AdvanceStatusDto } from './dto/advance-status.dto';
import { QuoteRideDto } from './dto/quote-ride.dto';

@Controller('rides')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RidesController {
  constructor(private readonly ridesService: RidesService) {}

  @Get('scheduled')
  @RequirePermissions('corridas.visualizar')
  findScheduled() {
    return this.ridesService.findScheduled();
  }

  @Get()
  @RequirePermissions('corridas.visualizar')
  findAll(
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
    @Query('driverId') driverId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.ridesService.findAll({ status, customerId, driverId, from, to }, paging(page, pageSize));
  }

  @Get(':id')
  @RequirePermissions('corridas.visualizar')
  findOne(@Param('id') id: string) {
    return this.ridesService.findOne(id);
  }

  @Get(':id/messages')
  @RequirePermissions('corridas.visualizar')
  listMessages(@Param('id') id: string) {
    return this.ridesService.listMessages(id);
  }

  @Get(':id/blocked-driver-ids')
  @RequirePermissions('corridas.visualizar')
  blockedDriverIds(@Param('id') id: string) {
    return this.ridesService.blockedDriverIdsForRide(id);
  }

  @Post()
  @RequirePermissions('corridas.editar')
  create(@Body() dto: CreateRideDto, @CurrentUser() user: AuthenticatedUser) {
    return this.ridesService.create(dto, user.sub);
  }

  // Antes de ':id/...' só por clareza — rota própria (não colide com nenhuma outra).
  @Post('quote')
  @RequirePermissions('corridas.editar')
  quote(@Body() dto: QuoteRideDto) {
    return this.ridesService.quote(dto);
  }

  @Post(':id/assign-driver')
  @RequirePermissions('corridas.editar')
  assignDriver(@Param('id') id: string, @Body() dto: AssignDriverDto, @CurrentUser() user: AuthenticatedUser) {
    return this.ridesService.assignDriver(id, dto, user.sub);
  }

  @Post(':id/advance')
  @RequirePermissions('corridas.editar')
  advance(@Param('id') id: string, @Body() dto: AdvanceStatusDto, @CurrentUser() user: AuthenticatedUser) {
    return this.ridesService.advanceStatus(id, dto, user.sub);
  }

  @Post(':id/redispatch')
  @RequirePermissions('corridas.editar')
  redispatch(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ridesService.redispatch(id, user.sub);
  }

  @Post(':id/cancel')
  @RequirePermissions('corridas.cancelar')
  cancel(@Param('id') id: string, @Body() dto: CancelRideDto, @CurrentUser() user: AuthenticatedUser) {
    return this.ridesService.cancel(id, dto, user.sub);
  }
}
