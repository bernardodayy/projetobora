import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePricingScheduleDto } from './dto/create-schedule.dto';
import { UpdatePricingScheduleDto } from './dto/update-schedule.dto';

@Injectable()
export class PricingSchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll() {
    return this.prisma.pricingSchedule.findMany({ orderBy: { priority: 'desc' } });
  }

  async findOne(id: string) {
    const schedule = await this.prisma.pricingSchedule.findUnique({ where: { id } });
    if (!schedule) throw new NotFoundException('Horário não encontrado');
    return schedule;
  }

  async create(dto: CreatePricingScheduleDto, actorId: string) {
    const schedule = await this.prisma.pricingSchedule.create({ data: { ...dto, daysOfWeek: dto.daysOfWeek ?? [] } });
    await this.audit.log({ actorId, action: 'CREATE', entity: 'PricingSchedule', entityId: schedule.id, after: schedule });
    return schedule;
  }

  async update(id: string, dto: UpdatePricingScheduleDto, actorId: string) {
    const before = await this.findOne(id);
    const schedule = await this.prisma.pricingSchedule.update({ where: { id }, data: dto });
    await this.audit.log({ actorId, action: 'UPDATE', entity: 'PricingSchedule', entityId: id, before, after: schedule });
    return schedule;
  }

  async remove(id: string, actorId: string) {
    const schedule = await this.findOne(id);
    await this.prisma.pricingSchedule.delete({ where: { id } });
    await this.audit.log({ actorId, action: 'DELETE', entity: 'PricingSchedule', entityId: id, before: schedule });
    return { success: true };
  }
}
