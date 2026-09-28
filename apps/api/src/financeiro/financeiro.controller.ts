import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { FinanceiroService } from './financeiro.service';
import { paging } from '../common/pagination';
import { UpdateCommissionDto } from './dto/update-commission.dto';

@Controller('financeiro')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FinanceiroController {
  constructor(private readonly financeiroService: FinanceiroService) {}

  @Get('summary')
  @RequirePermissions('financeiro.visualizar')
  getSummary(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('driverId') driverId?: string,
    @Query('customerId') customerId?: string,
    @Query('paymentMethod') paymentMethod?: string,
  ) {
    return this.financeiroService.getSummary({ from, to, driverId, customerId, paymentMethod });
  }

  @Get('daily')
  @RequirePermissions('financeiro.visualizar')
  getDaily(@Query('from') from?: string, @Query('to') to?: string) {
    return this.financeiroService.getDailyRevenue({ from, to });
  }

  @Get('transactions')
  @RequirePermissions('financeiro.visualizar')
  findTransactions(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('driverId') driverId?: string,
    @Query('customerId') customerId?: string,
    @Query('paymentMethod') paymentMethod?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.financeiroService.listTransactions({ from, to, driverId, customerId, paymentMethod, type, status }, paging(page, pageSize));
  }

  @Get('commission')
  @RequirePermissions('financeiro.visualizar')
  async getCommission() {
    return { percent: await this.financeiroService.getCommissionPercent() };
  }

  @Patch('commission')
  @RequirePermissions('configuracoes.editar')
  updateCommission(@Body() dto: UpdateCommissionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.financeiroService.updateCommissionPercent(dto, user.sub);
  }

  @Post('transactions/:id/settle')
  @RequirePermissions('financeiro.editar')
  settle(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.financeiroService.settlePayout(id, user.sub);
  }
}
