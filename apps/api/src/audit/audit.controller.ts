import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { AuditService } from './audit.service';
import { paging } from '../common/pagination';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermissions('auditoria.visualizar')
  findAll(@Query('entity') entity?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.auditService.findAll({ entity, ...paging(page, pageSize, 50) });
  }
}
