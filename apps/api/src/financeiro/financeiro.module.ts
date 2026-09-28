import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FinanceiroService } from './financeiro.service';
import { FinanceiroController } from './financeiro.controller';

@Module({
  imports: [AuditModule],
  controllers: [FinanceiroController],
  providers: [FinanceiroService],
  exports: [FinanceiroService],
})
export class FinanceiroModule {}
