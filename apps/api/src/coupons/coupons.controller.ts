import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { CouponsService } from './coupons.service';
import { CreateCouponDto } from './dto/create-coupon.dto';

@Controller('coupons')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Get()
  @RequirePermissions('cupons.visualizar')
  findAll() {
    return this.couponsService.findAll();
  }

  @Post()
  @RequirePermissions('cupons.editar')
  create(@Body() dto: CreateCouponDto, @CurrentUser() user: AuthenticatedUser) {
    return this.couponsService.create(dto, user.sub);
  }

  @Patch(':code/active')
  @RequirePermissions('cupons.editar')
  setActive(@Param('code') code: string, @Body('active') active: boolean, @CurrentUser() user: AuthenticatedUser) {
    return this.couponsService.setActive(code, active, user.sub);
  }
}
