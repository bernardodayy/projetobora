import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UpdatePricingConfigDto } from './dto/update-config.dto';

const TRACKED_FIELDS = ['baseFare', 'perKm', 'perMinute', 'minimumFare', 'combinationStrategy'] as const;

@Injectable()
export class PricingConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getActive() {
    const config = await this.prisma.pricingConfiguration.findFirst({ where: { isActive: true } });
    if (!config) throw new NotFoundException('Nenhuma configuração de tarifa ativa');
    return config;
  }

  async getHistory(configId: string) {
    const entries = await this.prisma.pricingConfigurationHistory.findMany({
      where: { configId },
      orderBy: { changedAt: 'desc' },
      take: 100,
    });

    const adminIds = [...new Set(entries.map((e) => e.changedById).filter((id): id is string => !!id))];
    const admins = await this.prisma.adminUser.findMany({ where: { id: { in: adminIds } }, select: { id: true, name: true } });
    const nameById = new Map(admins.map((a) => [a.id, a.name]));

    return entries.map((entry) => ({ ...entry, changedByName: entry.changedById ? (nameById.get(entry.changedById) ?? null) : null }));
  }

  async update(dto: UpdatePricingConfigDto, actorId: string) {
    const before = await this.getActive();

    const historyEntries = TRACKED_FIELDS.filter((field) => dto[field] !== undefined && String(dto[field]) !== String(before[field])).map(
      (field) => ({
        configId: before.id,
        field,
        previousValue: String(before[field]),
        newValue: String(dto[field]),
        changedById: actorId,
      }),
    );

    if (historyEntries.length > 0) {
      await this.prisma.pricingConfigurationHistory.createMany({ data: historyEntries });
    }

    const config = await this.prisma.pricingConfiguration.update({ where: { id: before.id }, data: dto });
    await this.audit.log({ actorId, action: 'UPDATE', entity: 'PricingConfiguration', entityId: config.id, before, after: config });
    return config;
  }
}
