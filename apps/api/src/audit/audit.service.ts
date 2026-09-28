import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { stripSecrets } from '../common/strip-secrets';
import { Page } from '../common/pagination';

interface AuditEntry {
  actorId?: string;
  actorType?: 'customer' | 'driver';
  actorLabel?: string;
  action: string;
  entity: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  // actorType default 'admin' quando vem actorId sem tipo explícito — mantém
  // toda chamada existente (painel admin) funcionando sem precisar mexer em
  // cada uma; só rides.service.ts passa actorType explicitamente hoje, para
  // as ações de self-service do cliente/motorista (ver RidesService.Actor).
  log(entry: AuditEntry) {
    return this.prisma.auditLog.create({
      data: {
        actorId: entry.actorType ? undefined : entry.actorId,
        actorType: entry.actorType ?? (entry.actorId ? 'admin' : undefined),
        actorLabel: entry.actorLabel,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        before: stripSecrets(entry.before) as any,
        after: stripSecrets(entry.after) as any,
        ip: entry.ip,
      },
    });
  }

  async findAll(params: { entity?: string; take: number; skip: number }) {
    const where = params.entity ? { entity: params.entity } : undefined;
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], // id: desempate estável entre páginas
        take: params.take,
        skip: params.skip,
        include: { actor: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return new Page(items, total);
  }
}
