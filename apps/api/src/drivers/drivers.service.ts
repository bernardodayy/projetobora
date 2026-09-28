import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { ReasonDto } from './dto/reason.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { presenceCutoff } from '../common/presence';
import { Page } from '../common/pagination';

interface FindAllFilters {
  status?: string;
  availability?: string;
  name?: string;
  cpf?: string;
  plate?: string;
}

const INCLUDE = {
  vehicles: { orderBy: { createdAt: 'asc' as const } },
  documents: { orderBy: { createdAt: 'desc' as const } },
  blocks: { orderBy: { blockedAt: 'desc' as const }, include: { blockedBy: { select: { id: true, name: true } } } },
};

@Injectable()
export class DriversService {
  private readonly logger = new Logger(DriversService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeGateway,
    private readonly notifications: NotificationsService,
  ) {}

  async findAll(filters: FindAllFilters, paging: { take: number; skip: number }) {
    const where = {
      deletedAt: null,
      status: filters.status as any,
      availability: filters.availability as any,
      name: filters.name ? { contains: filters.name, mode: 'insensitive' as const } : undefined,
      cpf: filters.cpf ? { contains: filters.cpf } : undefined,
      vehicles: filters.plate ? { some: { plate: { contains: filters.plate, mode: 'insensitive' as const } } } : undefined,
    };
    const [items, total] = await Promise.all([
      this.prisma.driver.findMany({
        where,
        include: {
          vehicles: { take: 1, orderBy: { createdAt: 'asc' } },
          blocks: { orderBy: { blockedAt: 'desc' }, take: 1, include: { blockedBy: { select: { id: true, name: true } } } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], // id: desempate estável entre páginas
        ...paging,
      }),
      this.prisma.driver.count({ where }),
    ]);
    return new Page(items, total);
  }

  async findOne(id: string) {
    const driver = await this.prisma.driver.findFirst({ where: { id, deletedAt: null }, include: INCLUDE });
    if (!driver) throw new NotFoundException('Motorista não encontrado');
    return driver;
  }

  async create(dto: CreateDriverDto, actorId: string) {
    const exists = await this.prisma.driver.findUnique({ where: { cpf: dto.cpf } });
    if (exists) throw new BadRequestException('CPF já cadastrado');
    const plateExists = await this.prisma.vehicle.findUnique({ where: { plate: dto.vehicle.plate } });
    if (plateExists) throw new BadRequestException('Placa já cadastrada');

    const driver = await this.prisma.driver.create({
      data: {
        name: dto.name,
        cpf: dto.cpf,
        phone: dto.phone,
        cnh: dto.cnh,
        cnhCategory: dto.cnhCategory,
        pixKey: dto.pixKey?.trim() || null,
        hasCardMachine: dto.hasCardMachine ?? false,
        vehicles: { create: dto.vehicle },
      },
      include: INCLUDE,
    });

    await this.audit.log({ actorId, action: 'CREATE', entity: 'Driver', entityId: driver.id, after: driver });
    await this.notifications.create({
      channel: 'INTERNAL',
      title: 'Novo motorista aguardando aprovação',
      message: driver.name,
      targetType: 'admin',
      targetId: driver.id,
    });
    return driver;
  }

  async update(id: string, dto: UpdateDriverDto, actorId: string) {
    const before = await this.findOne(id);

    const { vehicle, pixKey, ...driverFields } = dto;
    // Chave vazia = sem chave (null), senão o filtro do despacho a trataria como cadastrada.
    await this.prisma.driver.update({ where: { id }, data: { ...driverFields, ...(pixKey !== undefined ? { pixKey: pixKey.trim() || null } : {}) } });

    if (vehicle && before.vehicles[0]) {
      await this.prisma.vehicle.update({ where: { id: before.vehicles[0].id }, data: vehicle });
    }

    const driver = await this.findOne(id);
    await this.audit.log({ actorId, action: 'UPDATE', entity: 'Driver', entityId: id, before, after: driver });
    return driver;
  }

  async approve(id: string, actorId: string) {
    const before = await this.findOne(id);
    if (before.status !== 'PENDING') throw new BadRequestException('Somente motoristas pendentes podem ser aprovados');

    const driver = await this.prisma.driver.update({ where: { id }, data: { status: 'APPROVED' } });
    await this.audit.log({ actorId, action: 'APPROVE', entity: 'Driver', entityId: id, before, after: driver });
    this.realtime.broadcastDriverUpdated(driver);
    return driver;
  }

  async reject(id: string, dto: ReasonDto, actorId: string) {
    const before = await this.findOne(id);
    if (before.status !== 'PENDING') throw new BadRequestException('Somente motoristas pendentes podem ser reprovados');

    const driver = await this.prisma.driver.update({ where: { id }, data: { status: 'REJECTED' } });
    await this.audit.log({
      actorId,
      action: 'REJECT',
      entity: 'Driver',
      entityId: id,
      before,
      after: { ...driver, reason: dto.reason },
    });
    return driver;
  }

  async requestCorrection(id: string, dto: ReasonDto, actorId: string) {
    const driver = await this.findOne(id);
    await this.audit.log({
      actorId,
      action: 'REQUEST_CORRECTION',
      entity: 'Driver',
      entityId: id,
      after: { message: dto.reason },
    });
    return driver;
  }

  async block(id: string, dto: ReasonDto, actorId: string) {
    const before = await this.findOne(id);

    const [driver] = await this.prisma.$transaction([
      this.prisma.driver.update({ where: { id }, data: { status: 'BLOCKED', availability: 'OFFLINE' } }),
      this.prisma.driverBlock.create({ data: { driverId: id, reason: dto.reason, blockedById: actorId } }),
    ]);

    await this.audit.log({ actorId, action: 'BLOCK', entity: 'Driver', entityId: id, before, after: { ...driver, reason: dto.reason } });
    this.realtime.broadcastDriverUpdated(driver);
    return this.findOne(id);
  }

  async unblock(id: string, actorId: string) {
    const before = await this.findOne(id);
    if (before.status !== 'BLOCKED') throw new BadRequestException('Motorista não está bloqueado');

    const openBlock = before.blocks.find((b) => !b.unblockedAt);

    await this.prisma.$transaction([
      this.prisma.driver.update({ where: { id }, data: { status: 'APPROVED' } }),
      ...(openBlock
        ? [this.prisma.driverBlock.update({ where: { id: openBlock.id }, data: { unblockedAt: new Date() } })]
        : []),
    ]);

    const driver = await this.findOne(id);
    await this.audit.log({ actorId, action: 'UNBLOCK', entity: 'Driver', entityId: id, before, after: driver });
    this.realtime.broadcastDriverUpdated(driver);
    return driver;
  }

  // `presence`: a chamada veio do próprio app do motorista (vale como sinal de vida). A correção
  // manual do admin (motorista avisou a posição por telefone) não prova que o app está aberto.
  async updateLocation(id: string, dto: UpdateLocationDto, presence = false) {
    const now = new Date();
    const driver = await this.prisma.driver.update({
      where: { id },
      data: { lastLat: dto.lat, lastLng: dto.lng, lastLocationAt: now, ...(presence ? { lastSeenAt: now } : {}) },
    });
    this.realtime.broadcastDriverUpdated(driver);
    return driver;
  }

  async updateAvailability(id: string, availability: string, actorId?: string) {
    const before = await this.findOne(id);
    if (before.status !== 'APPROVED') throw new BadRequestException('Somente motoristas aprovados podem alterar disponibilidade');

    // Ficar disponível conta como sinal de vida (o motorista acabou de ligar o app ou o operador o
    // marcou) — dá a carência de PRESENCE_TIMEOUT_MS antes do próximo sinal.
    const driver = await this.prisma.driver.update({
      where: { id },
      data: { availability: availability as any, ...(availability === 'AVAILABLE' ? { lastSeenAt: new Date() } : {}) },
    });
    await this.audit.log({ actorId, action: 'UPDATE_AVAILABILITY', entity: 'Driver', entityId: id, before, after: driver });
    this.realtime.broadcastDriverUpdated(driver);
    return driver;
  }

  // O próprio motorista mexendo em como recebe. Vai para a auditoria (com o antes/depois): trocar a chave
  // Pix é o caminho clássico de desvio de pagamento, então fica registrado quem mudou e quando.
  async updatePayment(id: string, dto: { pixKey?: string; hasCardMachine?: boolean }) {
    const before = await this.findOne(id);
    const driver = await this.prisma.driver.update({
      where: { id },
      data: { ...(dto.pixKey !== undefined ? { pixKey: dto.pixKey.trim() || null } : {}), ...(dto.hasCardMachine !== undefined ? { hasCardMachine: dto.hasCardMachine } : {}) },
    });
    await this.audit.log({
      actorType: 'driver',
      actorLabel: before.name,
      action: 'UPDATE_PAYMENT',
      entity: 'Driver',
      entityId: id,
      before: { pixKey: before.pixKey, hasCardMachine: before.hasCardMachine },
      after: { pixKey: driver.pixKey, hasCardMachine: driver.hasCardMachine },
    });
    this.realtime.broadcastDriverUpdated(driver);
    return driver;
  }

  // Sinal de vida do app (a cada 60 s enquanto online). Devolve a disponibilidade real: se o servidor
  // já o deixou offline por falta de sinal, o app acompanha em vez de mostrar "Online" sem receber nada.
  async heartbeat(id: string) {
    const driver = await this.prisma.driver.update({ where: { id }, data: { lastSeenAt: new Date() }, select: { availability: true } });
    return { availability: driver.availability };
  }

  // Motorista "disponível" sem sinal há mais de PRESENCE_TIMEOUT_MS vira offline (e some do mapa da
  // Central). Só mexe em AVAILABLE: quem está em corrida (BUSY…) não é derrubado por perda de sinal.
  @Cron(CronExpression.EVERY_MINUTE)
  async expireStalePresence() {
    const stale = await this.prisma.driver.findMany({
      where: { availability: 'AVAILABLE', OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: presenceCutoff() } }] },
      select: { id: true },
    });
    for (const { id } of stale) {
      try {
        // availability no where: se o despacho acabou de ocupar esse motorista, o update não acontece.
        const driver = await this.prisma.driver.update({ where: { id, availability: 'AVAILABLE' }, data: { availability: 'OFFLINE' } });
        this.realtime.broadcastDriverUpdated(driver);
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')) {
          this.logger.error(`Falha ao colocar o motorista ${id} offline por falta de sinal`, error instanceof Error ? error.stack : String(error));
        }
      }
    }
  }

  // Sem cadastro autônomo pelo app ainda: é o admin quem define a senha inicial
  // (ou reseta uma esquecida) para o motorista entrar no app pela primeira vez.
  async setPassword(id: string, password: string, actorId: string) {
    await this.findOne(id);
    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.driver.update({ where: { id }, data: { passwordHash } });
    await this.audit.log({ actorId, action: 'SET_PASSWORD', entity: 'Driver', entityId: id });
    return { success: true };
  }
}
