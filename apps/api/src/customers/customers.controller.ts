import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { CustomersService } from './customers.service';
import { paging } from '../common/pagination';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { BlockCustomerDto } from './dto/block-customer.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { SetPasswordDto } from './dto/set-password.dto';

@Controller('customers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @RequirePermissions('clientes.visualizar')
  findAll(
    @Query('name') name?: string,
    @Query('cpf') cpf?: string,
    @Query('phone') phone?: string,
    @Query('status') status?: 'ACTIVE' | 'BLOCKED',
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.customersService.findAll({ name, cpf, phone, status }, paging(page, pageSize));
  }

  @Get(':id')
  @RequirePermissions('clientes.visualizar')
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @Post()
  @RequirePermissions('clientes.editar')
  create(@Body() dto: CreateCustomerDto, @CurrentUser() user: AuthenticatedUser) {
    return this.customersService.create(dto, user.sub);
  }

  @Patch(':id')
  @RequirePermissions('clientes.editar')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto, @CurrentUser() user: AuthenticatedUser) {
    return this.customersService.update(id, dto, user.sub);
  }

  @Post(':id/block')
  @RequirePermissions('clientes.bloquear')
  block(@Param('id') id: string, @Body() dto: BlockCustomerDto, @CurrentUser() user: AuthenticatedUser) {
    return this.customersService.block(id, dto, user.sub);
  }

  @Post(':id/unblock')
  @RequirePermissions('clientes.bloquear')
  unblock(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.customersService.unblock(id, user.sub);
  }

  @Post(':id/addresses')
  @RequirePermissions('clientes.editar')
  addAddress(@Param('id') id: string, @Body() dto: CreateAddressDto, @CurrentUser() user: AuthenticatedUser) {
    return this.customersService.addAddress(id, dto, user.sub);
  }

  @Delete(':id/addresses/:addressId')
  @RequirePermissions('clientes.editar')
  removeAddress(
    @Param('id') id: string,
    @Param('addressId') addressId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customersService.removeAddress(id, addressId, user.sub);
  }

  @Patch(':id/password')
  @RequirePermissions('clientes.editar')
  setPassword(@Param('id') id: string, @Body() dto: SetPasswordDto, @CurrentUser() user: AuthenticatedUser) {
    return this.customersService.setPassword(id, dto.password, user.sub);
  }
}
