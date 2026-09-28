import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Cron, CronExpression, Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PricingEngineService } from '../pricing/pricing-engine.service';
import { FinanceiroService } from '../financeiro/financeiro.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { CouponsService } from '../coupons/coupons.service';
import { round2 } from '../pricing/geometry.util';
import { nearestDriverPostgis } from '../common/postgis';
import { rangeBound } from '../common/timezone';
import { Page } from '../common/pagination';
import { CreateRideDto } from './dto/create-ride.dto';
import { QuoteRideDto } from './dto/quote-ride.dto';
import { AssignDriverDto } from './dto/assign-driver.dto';
import { CancelRideDto } from './dto/cancel-ride.dto';
import { AdvanceStatusDto } from './dto/advance-status.dto';

interface FindAllFilters {
  status?: string;
  customerId?: string;
  driverId?: string;
  from?: string;
  to?: string;
}

// Ação de admin continua passando só o id (string), como sempre — vira
// actorType 'admin' automaticamente em AuditService.log. Ação do próprio
// cliente/motorista (cancelar, recusar, avançar) passa o objeto, com o nome
// capturado na hora pra aparecer na Auditoria em vez de "Sistema".
type Actor = string | { type: 'customer' | 'driver'; id: string; label: string } | undefined;

function auditActorFields(actor: Actor) {
  if (!actor || typeof actor === 'string') return { actorId: actor };
  return { actorType: actor.type, actorLabel: actor.label };
}

// ponytail: sem paginação real ainda — corta em 200 registros. Adicionar
// paginação de verdade quando o volume de corridas crescer além disso.
const LIST_LIMIT = 200;

const INCLUDE = {
  customer: { select: { id: true, name: true, phone: true } },
  driver: { select: { id: true, name: true, phone: true, lastLat: true, lastLng: true, vehicles: { take: 1 } } },
  events: { orderBy: { createdAt: 'asc' as const } },
};

// Transições permitidas via advanceStatus(); atribuir motorista e cancelar têm seus próprios métodos.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  REQUESTED: ['SEARCHING_DRIVER'],
  SEARCHING_DRIVER: [],
  DRIVER_ASSIGNED: ['DRIVER_EN_ROUTE'],
  DRIVER_EN_ROUTE: ['PASSENGER_ABOARD'],
  PASSENGER_ABOARD: ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

// Texto pra mensagens de erro que o usuário lê no app (nunca o enum cru em inglês).
const STATUS_PT: Record<string, string> = {
  REQUESTED: 'solicitada',
  SEARCHING_DRIVER: 'procurando motorista',
  DRIVER_ASSIGNED: 'aguardando o motorista aceitar',
  DRIVER_EN_ROUTE: 'com o motorista a caminho',
  PASSENGER_ABOARD: 'com o passageiro a bordo',
  IN_PROGRESS: 'em andamento',
  COMPLETED: 'finalizada',
  CANCELLED: 'cancelada',
};

// Corrida que ainda ocupa o cliente: um cliente não pode estar em duas ao mesmo tempo.
const ACTIVE_STATUSES = ['REQUESTED', 'SEARCHING_DRIVER', 'DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'PASSENGER_ABOARD', 'IN_PROGRESS'];

// Quantas vezes tenta "reivindicar" outro motorista se o mais próximo foi pego por outra corrida no meio do caminho.
const MAX_CLAIM_TRIES = 5;

// Motivo gravado quando o despacho cancela sozinho (o app do cliente mostra esse texto).
export const NO_DRIVER_REASON = 'Nenhum motorista disponível no momento. Tente novamente em instantes.';

const isNotFound = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';

const ASSIGNABLE_FROM = ['REQUESTED', 'SEARCHING_DRIVER'];
const CANCELLABLE_FROM = ['REQUESTED', 'SEARCHING_DRIVER', 'DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'PASSENGER_ABOARD', 'IN_PROGRESS'];
// Só faz sentido trocar mensagem depois que existe motorista atribuído — antes
// disso (REQUESTED/SEARCHING_DRIVER) não há ninguém do outro lado pra receber.
const MESSAGEABLE_FROM = ['DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'PASSENGER_ABOARD', 'IN_PROGRESS'];

@Injectable()
export class RidesService {
  private readonly logger = new Logger(RidesService.name);
  private dispatching = false;
  private ticking = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeGateway,
    private readonly pricingEngine: PricingEngineService,
    private readonly financeiro: FinanceiroService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
    private readonly coupons: CouponsService,
  ) {}

  async findAll(filters: FindAllFilters, paging: { take: number; skip: number }) {
    const where = {
      status: filters.status as any,
      customerId: filters.customerId,
      driverId: filters.driverId,
      requestedAt: filters.from || filters.to ? { gte: rangeBound(filters.from, 'start'), lte: rangeBound(filters.to, 'end') } : undefined,
    };
    const [items, total] = await Promise.all([
      this.prisma.ride.findMany({
        where,
        include: { customer: { select: { id: true, name: true } }, driver: { select: { id: true, name: true } } },
        orderBy: [{ requestedAt: 'desc' }, { id: 'asc' }], // id: desempate estável entre páginas
        ...paging,
      }),
      this.prisma.ride.count({ where }),
    ]);
    return new Page(items, total);
  }

  findScheduled() {
    return this.prisma.ride.findMany({
      where: { scheduledAt: { not: null }, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
      include: { customer: { select: { id: true, name: true } }, driver: { select: { id: true, name: true } } },
      orderBy: { scheduledAt: 'asc' },
      take: LIST_LIMIT,
    });
  }

  async findOne(id: string) {
    const ride = await this.prisma.ride.findUnique({ where: { id }, include: INCLUDE });
    if (!ride) throw new NotFoundException('Corrida não encontrada');
    return ride;
  }

  listMessages(rideId: string) {
    return this.prisma.rideMessage.findMany({ where: { rideId }, orderBy: { createdAt: 'asc' } });
  }

  async sendMessage(rideId: string, senderType: 'customer' | 'driver', message: string) {
    const ride = await this.findOne(rideId);
    if (!MESSAGEABLE_FROM.includes(ride.status)) {
      throw new BadRequestException('Só é possível trocar mensagens durante uma corrida com motorista atribuído');
    }
    const created = await this.prisma.rideMessage.create({ data: { rideId, senderType, message } });
    if (senderType === 'customer' && ride.driverId) this.realtime.notifyDriver(ride.driverId, 'ride-message.created');
    if (senderType === 'driver') this.realtime.notifyCustomer(ride.customerId, 'ride-message.created');
    return created;
  }

  // Só grava se a corrida ainda está no estado que o chamador leu (`where` leva o
  // status esperado): duas requisições concorrentes — duplo toque, cron + operador,
  // motorista + operador — não passam as duas pelo mesmo estado. Sem isso, completar
  // duas vezes gerava repasse/cobrança de carteira em dobro e cancelar podia
  // sobrescrever uma corrida que acabava de ser finalizada.
  private async guardedUpdate(where: Prisma.RideWhereUniqueInput, data: Prisma.RideUncheckedUpdateInput) {
    try {
      return await this.prisma.ride.update({ where, data, include: INCLUDE });
    } catch (error) {
      if (isNotFound(error)) throw new ConflictException('A corrida mudou enquanto você agia — atualize a tela e tente de novo.');
      throw error;
    }
  }

  private async recordEvent(rideId: string, status: string, metadata?: Record<string, unknown>) {
    await this.prisma.rideEvent.create({ data: { rideId, status: status as any, metadata: metadata as any } });
  }

  private async freeDriver(driverId: string) {
    const driver = await this.prisma.driver.update({ where: { id: driverId }, data: { availability: 'AVAILABLE' } });
    this.realtime.broadcastDriverUpdated(driver);
  }

  // Avisa, pela sala própria de cada motorista, quem precisa saber que essa corrida mudou:
  // o motorista atual (nova atribuição, avanço de status) e o anterior, se acabou de perder
  // a corrida (redespacho, cancelamento). O app do motorista só reage a isso e busca de novo
  // /driver-app/rides/current — nunca recebe o payload completo pelo socket.
  private notifyDrivers(driverIds: (string | null | undefined)[]) {
    const unique = new Set(driverIds.filter((id): id is string => !!id));
    for (const driverId of unique) this.realtime.notifyDriver(driverId, 'ride.updated');
  }

  // Histórico de despacho da corrida, lido dos eventos DRIVER_ASSIGNED: `tried` são
  // os motoristas já oferecidos (pra não repetir num redespacho) e `attempts` conta
  // só as ofertas de verdade — a anotação de recusa (declined) é gravada como outro
  // evento DRIVER_ASSIGNED e antes contava em dobro, esgotando as tentativas na metade.
  private async dispatchHistory(rideId: string) {
    const events = await this.prisma.rideEvent.findMany({ where: { rideId, status: 'DRIVER_ASSIGNED' }, select: { metadata: true } });
    const metas = events.map((e) => e.metadata as { driverId?: string; declined?: boolean } | null);
    return {
      tried: metas.map((m) => m?.driverId).filter((id): id is string => !!id),
      attempts: metas.filter((m) => !m?.declined).length,
    };
  }

  // Motoristas que o próprio cliente bloqueou, mais os motoristas que bloquearam
  // esse cliente — só vale para o despacho automático (ver tryAutoAssign), não
  // impede atribuição manual pelo admin. RidesController expõe o wrapper
  // público abaixo pra a tela de atribuição manual avisar (sem bloquear) o
  // operador quando escolhe um motorista bloqueado com esse cliente.
  private async blockedDriverIds(customerId: string): Promise<string[]> {
    const [byCustomer, byDrivers] = await Promise.all([
      this.prisma.customerBlockedDriver.findMany({ where: { customerId }, select: { driverId: true } }),
      this.prisma.driverBlockedCustomer.findMany({ where: { customerId }, select: { driverId: true } }),
    ]);
    return [...byCustomer, ...byDrivers].map((r) => r.driverId);
  }

  async blockedDriverIdsForRide(rideId: string): Promise<string[]> {
    const ride = await this.findOne(rideId);
    return this.blockedDriverIds(ride.customerId);
  }

  // Motoristas favoritados pelo cliente — no despacho automático (ver
  // tryAutoAssign), um favorito disponível fura a fila de distância e recebe
  // a oferta primeiro; se recusar, o redespacho já exclui quem recusou e cai
  // no próximo favorito ou no motorista mais próximo, sem lógica extra.
  private async favoriteDriverIds(customerId: string): Promise<string[]> {
    const rows = await this.prisma.customerFavoriteDriver.findMany({ where: { customerId }, select: { driverId: true } });
    return rows.map((r) => r.driverId);
  }

  // Motorista aprovado, disponível e com localização conhecida mais próximo da origem,
  // respeitando o raio preferencial e, na falta de alguém dentro dele, a distância máxima
  // configurados em Configurações → Despacho. `onlyDriverIds`, quando passado, restringe a
  // busca a esse conjunto (usado para priorizar favoritos sem duplicar a lógica de ranking).
  // Consulta espacial indexada (PostGIS, ver common/postgis.ts) — critérios de elegibilidade
  // (aprovado, disponível, sinal de vida recente, capaz de receber a forma de pagamento) e a
  // preferência pelo raio menor vivem lá agora, não mais aqui.
  private async findNearestAvailableDriver(origin: { lat: number; lng: number }, excludeDriverIds: string[], onlyDriverIds?: string[], paymentMethod?: string | null) {
    const despacho = await this.settings.getSection('despacho');
    return nearestDriverPostgis(this.prisma, origin, {
      excludeDriverIds,
      onlyDriverIds,
      maxKm: despacho.distanciaMaximaKm,
      preferredKm: despacho.raioProcuraKm,
      paymentMethod,
    });
  }

  // Pega o motorista de vez (AVAILABLE → BUSY numa instrução só): dois pedidos
  // simultâneos que escolhem o mesmo "mais próximo" não ficam com o mesmo motorista.
  private async claimDriver(driverId: string) {
    try {
      return await this.prisma.driver.update({ where: { id: driverId, availability: 'AVAILABLE' }, data: { availability: 'BUSY' } });
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  // `expectedStatus`: em que estado a corrida está agora — o update só vale se ela continua nele (o
  // cliente pode ter cancelado enquanto o motorista era escolhido).
  private async tryAutoAssign(rideId: string, customerId: string, origin: { lat: number; lng: number }, excludeDriverIds: string[] = [], expectedStatus: string = 'REQUESTED', paymentMethod?: string | null) {
    const excluded = [...excludeDriverIds, ...(await this.blockedDriverIds(customerId))];
    const favoriteIds = await this.favoriteDriverIds(customerId);
    const { tempoOfertaSegundos } = await this.settings.getSection('despacho');

    for (let attempt = 0; attempt < MAX_CLAIM_TRIES; attempt++) {
      const nearestFavorite = favoriteIds.length ? await this.findNearestAvailableDriver(origin, excluded, favoriteIds, paymentMethod) : null;
      const nearest = nearestFavorite ?? (await this.findNearestAvailableDriver(origin, excluded, undefined, paymentMethod));
      if (!nearest) return null;

      const driver = await this.claimDriver(nearest.id);
      if (!driver) {
        excluded.push(nearest.id); // outra corrida levou esse motorista primeiro
        continue;
      }
      this.realtime.broadcastDriverUpdated(driver);

      // A oferta vence em tempoOfertaSegundos: sem resposta, expireStaleOffers passa a corrida ao próximo.
      const offerExpiresAt = new Date(Date.now() + (tempoOfertaSegundos ?? 15) * 1000);
      let ride;
      try {
        ride = await this.guardedUpdate({ id: rideId, status: expectedStatus as any }, { driverId: driver.id, status: 'DRIVER_ASSIGNED', offerExpiresAt });
      } catch (error) {
        await this.freeDriver(driver.id); // a corrida mudou (ex.: cancelada) — o motorista não fica preso
        throw error;
      }
      await this.recordEvent(rideId, 'DRIVER_ASSIGNED', { driverId: driver.id, auto: true, distanceKm: round2(nearest.distanceKm) });
      return ride;
    }
    return null;
  }

  // Estimativa para o formulário da Central: o preço e o desconto que create() vai aplicar, sem criar nada.
  // Cupom inválido não é erro aqui (volta em `couponError`) — o operador vê o motivo e corrige antes de salvar.
  async quote(dto: QuoteRideDto) {
    const pricing = await this.pricingEngine
      .calculate({ lat: dto.originLat, lng: dto.originLng }, { lat: dto.destinationLat, lng: dto.destinationLng }, dto.scheduledAt ? new Date(dto.scheduledAt) : new Date())
      .catch(() => null); // sem tarifa ativa: sem estimativa (create() também deixa o preço pendente)
    if (!pricing) return { pricing: null, discount: 0, finalPrice: null, couponCode: null, couponError: null };

    let discount = 0;
    let finalPrice = pricing.finalPrice;
    let couponCode: string | null = null;
    let couponError: string | null = null;
    if (dto.couponCode?.trim()) {
      try {
        const applied = await this.coupons.validate(dto.couponCode.trim(), pricing.finalPrice, dto.customerId);
        discount = applied.discount;
        finalPrice = applied.finalPrice;
        couponCode = applied.code;
      } catch (error) {
        if (!(error instanceof BadRequestException)) throw error;
        couponError = error.message;
      }
    }
    return { pricing: { distanceKm: pricing.distanceKm, durationMin: pricing.durationMin, price: pricing.finalPrice }, discount, finalPrice, couponCode, couponError };
  }

  async create(dto: CreateRideDto, actor?: Actor) {
    const customer = await this.prisma.customer.findFirst({ where: { id: dto.customerId, deletedAt: null } });
    if (!customer || customer.status === 'BLOCKED') throw new BadRequestException('Cliente não encontrado ou bloqueado');

    if (dto.driverId) {
      const driver = await this.prisma.driver.findFirst({ where: { id: dto.driverId, deletedAt: null } });
      if (!driver || driver.status !== 'APPROVED') throw new BadRequestException('Motorista indisponível para atribuição');
      if (driver.availability === 'BUSY') throw new BadRequestException('Esse motorista já está em outra corrida');
    }

    // Corrida agendada bem no futuro só entra na fila de despacho perto da
    // hora (ver @Cron dispatchScheduledRides) — pedir agora não deveria
    // oferecer o motorista mais próximo de agora para uma viagem de amanhã.
    const isFutureSchedule = !!dto.scheduledAt && new Date(dto.scheduledAt).getTime() > Date.now() + 60_000;

    // Duplo toque em "Pedir corrida" (ou dois atendentes) criava duas corridas
    // e dois motoristas ocupados para o mesmo passageiro.
    if (!isFutureSchedule) {
      const active = await this.prisma.ride.findFirst({
        where: {
          customerId: dto.customerId,
          status: { in: ACTIVE_STATUSES as any },
          OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date(Date.now() + 60_000) } }],
        },
        select: { id: true },
      });
      if (active) throw new BadRequestException('Este cliente já tem uma corrida em andamento');
    }

    const pricing = await this.pricingEngine
      .calculate(
        { lat: dto.originLat, lng: dto.originLng },
        { lat: dto.destinationLat, lng: dto.destinationLng },
        dto.scheduledAt ? new Date(dto.scheduledAt) : new Date(),
      )
      .catch(() => null); // sem configuração de tarifa ativa: corrida é criada mesmo assim, preço fica pendente

    // Cupom rejeita na hora de pedir (diferente do preview, que só mostra o
    // erro sem travar) — o cliente já viu a prévia, aqui é a confirmação.
    let finalPrice = pricing?.finalPrice;
    let discountApplied: number | undefined;
    if (dto.couponCode && pricing) {
      const applied = await this.coupons.validate(dto.couponCode, pricing.finalPrice, dto.customerId);
      finalPrice = applied.finalPrice;
      discountApplied = applied.discount;
    }

    if (dto.paymentMethod === 'WALLET' && finalPrice != null) {
      if (Number(customer.walletBalance) < finalPrice) {
        throw new BadRequestException('Saldo da carteira insuficiente para essa corrida');
      }
    }

    // Corrida + resgate do cupom na mesma transação: se o cupom esgotar entre a
    // validação e aqui, nada é criado — antes ficava uma corrida órfã (com o
    // desconto já aplicado, sem despacho) e o cliente via só o erro do cupom.
    const created = await this.prisma.$transaction(async (tx) => {
      const ride = await tx.ride.create({
        data: {
          customerId: dto.customerId,
          driverId: dto.driverId,
          originAddress: dto.originAddress,
          originLat: dto.originLat,
          originLng: dto.originLng,
          destinationAddress: dto.destinationAddress,
          destinationLat: dto.destinationLat,
          destinationLng: dto.destinationLng,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
          paymentMethod: dto.paymentMethod,
          couponCode: dto.couponCode && pricing ? dto.couponCode.toUpperCase() : undefined,
          discountApplied,
          status: dto.driverId ? 'DRIVER_ASSIGNED' : 'REQUESTED',
          distanceKm: pricing?.distanceKm,
          durationMin: pricing?.durationMin,
          baseFare: pricing?.baseFare,
          distanceFare: pricing?.distanceFare,
          timeFare: pricing?.timeFare,
          appliedMultiplier: pricing?.appliedMultiplier,
          finalPrice,
          pricingBreakdown: pricing ? (pricing as any) : undefined,
        },
      });
      if (dto.couponCode && pricing) await this.coupons.redeem(dto.couponCode, dto.customerId, ride.id, tx);
      return ride;
    });

    // driverId no evento: se esse motorista não responder, o redespacho não o oferece de novo.
    await this.recordEvent(created.id, created.status, dto.driverId ? { driverId: dto.driverId } : undefined);

    if (dto.driverId) {
      const driver = await this.prisma.driver.update({ where: { id: dto.driverId }, data: { availability: 'BUSY' } });
      this.realtime.broadcastDriverUpdated(driver);
    } else if (!isFutureSchedule) {
      const assigned = await this.tryAutoAssign(created.id, dto.customerId, { lat: dto.originLat, lng: dto.originLng }, [], 'REQUESTED', dto.paymentMethod);
      if (!assigned) {
        await this.prisma.ride.update({ where: { id: created.id }, data: { status: 'SEARCHING_DRIVER' } });
        await this.recordEvent(created.id, 'SEARCHING_DRIVER');
      }
    }

    const ride = await this.findOne(created.id);
    await this.audit.log({ ...auditActorFields(actor), action: 'CREATE', entity: 'Ride', entityId: ride.id, after: ride });
    this.realtime.broadcastRideUpdated(ride);
    this.notifyDrivers([ride.driverId]);
    this.realtime.notifyCustomer(ride.customerId, 'ride.updated');
    return ride;
  }

  // Roda a cada minuto: corridas agendadas cuja hora chegou e que create()
  // deixou de fora do despacho automático (ver isFutureSchedule acima) agora
  // entram na fila normalmente — mesmo tryAutoAssign de uma corrida pedida
  // na hora, só que disparado pelo relógio em vez de por um pedido HTTP.
  @Cron(CronExpression.EVERY_MINUTE)
  async dispatchScheduledRides() {
    // Uma rodada lenta não pode se sobrepor à seguinte (despacharia a mesma corrida duas vezes).
    if (this.dispatching) return;
    this.dispatching = true;
    try {
      const due = await this.prisma.ride.findMany({
        where: { status: 'REQUESTED', driverId: null, scheduledAt: { lte: new Date() } },
      });

      // Uma corrida com problema não pode travar as outras da fila.
      for (const ride of due) {
        try {
          const assigned = await this.tryAutoAssign(ride.id, ride.customerId, { lat: Number(ride.originLat), lng: Number(ride.originLng) }, [], 'REQUESTED', ride.paymentMethod);
          if (!assigned) {
            await this.prisma.ride.update({ where: { id: ride.id }, data: { status: 'SEARCHING_DRIVER' } });
            await this.recordEvent(ride.id, 'SEARCHING_DRIVER');
          }
          const updated = await this.findOne(ride.id);
          this.realtime.broadcastRideUpdated(updated);
          this.notifyDrivers([updated.driverId]);
          this.realtime.notifyCustomer(updated.customerId, 'ride.updated');
        } catch (error) {
          this.logger.error(`Falha ao despachar a corrida agendada ${ride.id}`, error instanceof Error ? error.stack : String(error));
        }
      }
    } finally {
      this.dispatching = false;
    }
  }

  // A cada 3 s: (1) oferta que passou do prazo sem resposta vai para o próximo motorista; (2) corrida
  // sem motorista tenta de novo ou, passado o tempo máximo de busca, é cancelada. Intervalo curto
  // porque o prazo é de segundos; a flag evita duas rodadas ao mesmo tempo.
  // ponytail: varre as corridas em busca a cada rodada — com milhares simultâneas, mover pra fila (BullMQ/Redis).
  @Interval(3000)
  async dispatchTick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this.expireStaleOffers();
      await this.processSearchingRides();
    } catch (error) {
      this.logger.error('Falha na rodada de despacho', error instanceof Error ? error.stack : String(error));
    } finally {
      this.ticking = false;
    }
  }

  // Só ofertas do despacho automático têm prazo (offerExpiresAt); a redispatch é a mesma de quando
  // o motorista toca em "Recusar" ou o operador em "Motorista não respondeu" — inclusive o limite de
  // tentativas e o aviso à central quando não sobra ninguém.
  async expireStaleOffers() {
    const expired = await this.prisma.ride.findMany({
      where: { status: 'DRIVER_ASSIGNED', offerExpiresAt: { lte: new Date() } },
      select: { id: true },
    });
    for (const { id } of expired) {
      try {
        await this.redispatch(id, undefined, 'Sem resposta no tempo limite', true);
      } catch (error) {
        // Motorista aceitou/recusou ou a corrida mudou no meio do caminho: nada a fazer.
        if (error instanceof BadRequestException || error instanceof ConflictException) continue;
        this.logger.error(`Falha ao expirar a oferta da corrida ${id}`, error instanceof Error ? error.stack : String(error));
      }
    }
  }

  // Corrida em "procurando motorista" (ninguém disponível no pedido, ou o pessoal recusou/não respondeu):
  // enquanto houver tempo, tenta de novo a cada rodada — motorista que fica online ou volta ao raio no
  // meio da busca pega a corrida. Estourado o tempo máximo (Despacho → tempo máximo de busca), cancela
  // e avisa o cliente. Respeita o limite de tentativas: quem já foi oferecido não é oferecido de novo.
  async processSearchingRides() {
    const despacho = await this.settings.getSection('despacho');
    const now = Date.now();
    const searching = await this.prisma.ride.findMany({
      where: { status: 'SEARCHING_DRIVER', driverId: null, OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }] },
    });

    for (const ride of searching) {
      try {
        // Corrida agendada só começa a "procurar" na hora marcada.
        const startedAt = Math.max(ride.requestedAt.getTime(), ride.scheduledAt?.getTime() ?? 0);
        if (now - startedAt > despacho.tempoEsperaMinutos * 60_000) {
          await this.cancel(ride.id, { reason: NO_DRIVER_REASON });
          continue;
        }

        const { tried, attempts } = await this.dispatchHistory(ride.id);
        if (attempts >= despacho.tentativasDespacho) continue;

        const assigned = await this.tryAutoAssign(ride.id, ride.customerId, { lat: Number(ride.originLat), lng: Number(ride.originLng) }, tried, 'SEARCHING_DRIVER', ride.paymentMethod);
        if (!assigned) continue;
        this.realtime.broadcastRideUpdated(assigned);
        this.notifyDrivers([assigned.driverId]);
        this.realtime.notifyCustomer(assigned.customerId, 'ride.updated');
      } catch (error) {
        // Corrida cancelada/alterada no meio da rodada: some da fila sozinha, sem ruído.
        if (error instanceof BadRequestException || error instanceof ConflictException) continue;
        this.logger.error(`Falha ao reprocessar a corrida ${ride.id}`, error instanceof Error ? error.stack : String(error));
      }
    }
  }

  async assignDriver(id: string, dto: AssignDriverDto, actorId: string) {
    const before = await this.findOne(id);
    if (!ASSIGNABLE_FROM.includes(before.status)) {
      throw new BadRequestException(`Não é possível atribuir motorista a uma corrida com status ${before.status}`);
    }

    const driver = await this.prisma.driver.findFirst({ where: { id: dto.driverId, deletedAt: null } });
    if (!driver || driver.status !== 'APPROVED') throw new BadRequestException('Motorista indisponível para atribuição');
    if (driver.availability === 'BUSY') throw new BadRequestException('Esse motorista já está em outra corrida');

    // offerExpiresAt null: atribuição do operador não expira sozinha (foi decisão dele).
    const ride = await this.guardedUpdate({ id, status: before.status as any }, { driverId: dto.driverId, status: 'DRIVER_ASSIGNED', offerExpiresAt: null });

    await this.recordEvent(id, 'DRIVER_ASSIGNED', { driverId: dto.driverId });
    await this.audit.log({ actorId, action: 'ASSIGN_DRIVER', entity: 'Ride', entityId: id, before, after: ride });
    this.realtime.broadcastRideUpdated(ride);
    this.notifyDrivers([before.driverId, dto.driverId]);
    this.realtime.notifyCustomer(ride.customerId, 'ride.updated');
    const updatedDriver = await this.prisma.driver.update({ where: { id: dto.driverId }, data: { availability: 'BUSY' } });
    this.realtime.broadcastDriverUpdated(updatedDriver);
    return ride;
  }

  // Motorista atribuído não respondeu/está indisponível: libera-o e tenta o próximo mais
  // próximo automaticamente, até o limite de tentativas configurado em Despacho. Chamado
  // tanto pelo operador (Corridas → "Motorista não respondeu") quanto pelo próprio motorista
  // (app → "Recusar", via DriverAppService.declineRide).
  //
  // Esgotar as tentativas NÃO é erro: o motorista sempre consegue recusar (antes levava um
  // 400 e ficava preso na oferta) — a corrida só volta pra fila "procurando motorista" e a
  // central é avisada pra atribuir manualmente.
  async redispatch(id: string, actor?: Actor, declineReason?: string, timedOut = false) {
    const before = await this.findOne(id);
    if (before.status !== 'DRIVER_ASSIGNED') {
      throw new BadRequestException('Só é possível redespachar uma corrida com motorista atribuído, antes de ele iniciar o trajeto');
    }

    const despacho = await this.settings.getSection('despacho');
    const { tried, attempts } = await this.dispatchHistory(id);

    // Motivo da recusa é opcional (admin também chama redispatch, sem
    // motivo, quando o motorista some sem responder) — grava como metadata
    // no status atual em vez de criar um status novo só pra isso. Usa a
    // mesma chave `driverId` que tryAutoAssign usa para marcar tentativas,
    // senão dispatchHistory não exclui quem acabou de recusar —
    // com poucos motoristas disponíveis, a corrida podia voltar pro mesmo
    // motorista que já tinha dito não.
    if (declineReason && before.driverId) {
      await this.recordEvent(id, before.status, { driverId: before.driverId, declined: true, reason: declineReason, ...(timedOut ? { timedOut: true } : {}) });
    }

    // Tira a corrida do motorista atual de forma atômica (falha se recusa e operador
    // agirem juntos) e só então procura o próximo.
    await this.guardedUpdate({ id, status: 'DRIVER_ASSIGNED', driverId: before.driverId }, { driverId: null, status: 'SEARCHING_DRIVER', offerExpiresAt: null });
    if (before.driverId) await this.freeDriver(before.driverId);

    const origin = { lat: Number(before.originLat), lng: Number(before.originLng) };
    const exhausted = attempts >= despacho.tentativasDespacho;
    const assigned = exhausted ? null : await this.tryAutoAssign(id, before.customerId, origin, tried, 'SEARCHING_DRIVER', before.paymentMethod);

    let ride;
    if (assigned) {
      ride = assigned;
    } else {
      ride = await this.findOne(id);
      await this.recordEvent(id, 'SEARCHING_DRIVER', { reason: exhausted ? 'attempts_exhausted' : 'redispatch_exhausted' });
      await this.notifications.create({
        channel: 'INTERNAL',
        title: 'Despacho automático não encontrou motorista',
        message: `${ride.originAddress} → ${ride.destinationAddress}: atribua um motorista manualmente.`,
        targetType: 'admin',
        targetId: id,
      });
    }

    await this.audit.log({ ...auditActorFields(actor), action: 'REDISPATCH', entity: 'Ride', entityId: id, before, after: ride });
    this.realtime.broadcastRideUpdated(ride);
    this.notifyDrivers([before.driverId, ride.driverId]);
    this.realtime.notifyCustomer(ride.customerId, 'ride.updated');
    return ride;
  }

  async advanceStatus(id: string, dto: AdvanceStatusDto, actor?: Actor) {
    const before = await this.findOne(id);
    const allowed = ALLOWED_TRANSITIONS[before.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        before.status === 'CANCELLED'
          ? 'Esta corrida foi cancelada e não pode mais ser alterada.'
          : `Não é possível avançar: a corrida está ${STATUS_PT[before.status] ?? before.status}.`,
      );
    }

    const data: Prisma.RideUncheckedUpdateInput = { status: dto.status, offerExpiresAt: null };
    if (dto.status === 'COMPLETED') data.completedAt = new Date();

    const ride = await this.guardedUpdate({ id, status: before.status as any }, data);
    this.notifyDrivers([before.driverId]);
    this.realtime.notifyCustomer(ride.customerId, 'ride.updated');
    await this.recordEvent(id, dto.status);
    await this.audit.log({ ...auditActorFields(actor), action: 'UPDATE_STATUS', entity: 'Ride', entityId: id, before, after: ride });
    this.realtime.broadcastRideUpdated(ride);
    if (dto.status === 'COMPLETED') {
      // Libera o motorista primeiro: se o financeiro falhar, ele não fica preso como ocupado.
      if (before.driverId) await this.freeDriver(before.driverId);
      await this.financeiro.generateTransactionsForRide(id);
      if (before.paymentMethod === 'WALLET' && before.finalPrice != null) {
        await this.prisma.$transaction([
          this.prisma.customer.update({ where: { id: before.customerId }, data: { walletBalance: { decrement: before.finalPrice } } }),
          this.prisma.walletTransaction.create({
            data: {
              customerId: before.customerId,
              type: 'RIDE_PAYMENT',
              amount: before.finalPrice,
              description: `Corrida ${before.originAddress} → ${before.destinationAddress}`,
            },
          }),
        ]);
      }
    }
    return ride;
  }

  async cancel(id: string, dto: CancelRideDto, actor?: Actor) {
    const before = await this.findOne(id);
    if (!CANCELLABLE_FROM.includes(before.status)) {
      throw new BadRequestException(`Esta corrida está ${STATUS_PT[before.status] ?? before.status} e não pode mais ser cancelada.`);
    }

    const ride = await this.guardedUpdate(
      { id, status: before.status as any },
      { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: dto.reason, offerExpiresAt: null },
    );

    await this.recordEvent(id, 'CANCELLED', { reason: dto.reason });
    await this.audit.log({ ...auditActorFields(actor), action: 'CANCEL', entity: 'Ride', entityId: id, before, after: ride });
    this.realtime.broadcastRideUpdated(ride);
    this.notifyDrivers([before.driverId]);
    this.realtime.notifyCustomer(ride.customerId, 'ride.updated');
    if (before.driverId) await this.freeDriver(before.driverId);
    // Corrida cancelada não consumiu o cupom: devolve o uso pro cliente poder tentar de novo.
    await this.coupons.release(id);
    await this.notifications.create({
      channel: 'INTERNAL',
      title: 'Corrida cancelada',
      message: `${ride.customer.name}: ${ride.originAddress} → ${ride.destinationAddress}`,
      targetType: 'admin',
      targetId: id,
    });
    return ride;
  }
}
