import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { DriversService } from '../drivers/drivers.service';
import { RidesService } from '../rides/rides.service';
import { NotificationsService } from '../notifications/notifications.service';
import { localParts, rangeBound } from '../common/timezone';

const ACTIVE_RIDE_STATUSES = ['DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'PASSENGER_ABOARD', 'IN_PROGRESS'];

// ponytail: sem paginação de verdade ainda, mesmo limite usado no app do cliente.
const RIDE_HISTORY_LIMIT = 50;

// Telefone do passageiro só depois de aceitar: enquanto a corrida é só uma oferta (DRIVER_ASSIGNED) o
// motorista via nome, telefone e endereços e podia recusar só para ligar por fora da plataforma.
const withoutPhoneWhileOffered = <T extends { status: string; customer: { phone?: string } }>(ride: T): T =>
  ride.status === 'DRIVER_ASSIGNED' ? { ...ride, customer: { ...ride.customer, phone: undefined } } : ride;

@Injectable()
export class DriverAppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly drivers: DriversService,
    private readonly rides: RidesService,
    private readonly notifications: NotificationsService,
  ) {}

  me(driverId: string) {
    return this.drivers.findOne(driverId);
  }

  // Durante uma corrida a disponibilidade é do despacho: ficar "online" ocupado
  // recebia uma segunda oferta, e ficar "offline" era desfeito sozinho ao finalizar.
  async setAvailability(driverId: string, availability: 'AVAILABLE' | 'OFFLINE') {
    const active = await this.prisma.ride.findFirst({
      where: {
        driverId,
        status: { in: ACTIVE_RIDE_STATUSES as any },
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date(Date.now() + 60_000) } }],
      },
      select: { id: true },
    });
    if (active) throw new BadRequestException('Termine a corrida atual antes de mudar sua disponibilidade.');
    return this.drivers.updateAvailability(driverId, availability);
  }

  updatePayment(driverId: string, dto: { pixKey?: string; hasCardMachine?: boolean }) {
    return this.drivers.updatePayment(driverId, dto);
  }

  heartbeat(driverId: string) {
    return this.drivers.heartbeat(driverId);
  }

  updateLocation(driverId: string, lat: number, lng: number) {
    return this.drivers.updateLocation(driverId, { lat, lng }, true);
  }

  async currentRide(driverId: string) {
    // Envelopado em { ride } de propósito: um handler que devolve `null` puro
    // vira corpo vazio (não "null") em algumas respostas do Nest, e o app
    // quebraria tentando fazer JSON.parse de uma string vazia.
    //
    // Uma corrida agendada pra daqui a dias já pode estar com driverId
    // atribuído (central agenda por telefone com motorista definido na hora
    // — ver DriverAppService.scheduledRides) mas sem o filtro de scheduledAt
    // abaixo ela apareceria aqui como se estivesse rolando agora, com
    // Aceitar/Recusar de uma corrida que só começa dias depois.
    const ride = await this.prisma.ride.findFirst({
      where: {
        driverId,
        status: { in: ACTIVE_RIDE_STATUSES as any },
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date(Date.now() + 60_000) } }],
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        // Só status + hora: metadata dos eventos guarda ids e motivos de recusa de outros motoristas.
        events: { select: { id: true, status: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { requestedAt: 'desc' },
    });
    return { ride: ride && withoutPhoneWhileOffered(ride) };
  }

  // Resumo do próprio motorista: quantas corridas fez e o total delas hoje e no mês (no fuso da operação).
  // Não é "a receber": o passageiro paga direto ao motorista e a plataforma não repassa nada — é só pra ele
  // saber quanto rodou. Vem das corridas concluídas, não do Financeiro.
  async summary(driverId: string) {
    const today = localParts(new Date()).date;
    const monthStart = `${today.slice(0, 7)}-01`;
    const totals = async (from: string) => {
      const { _count, _sum } = await this.prisma.ride.aggregate({
        where: { driverId, status: 'COMPLETED', completedAt: { gte: rangeBound(from, 'start'), lte: rangeBound(today, 'end') } },
        _count: true,
        _sum: { finalPrice: true },
      });
      return { rides: _count, total: Number(_sum.finalPrice ?? 0) };
    };
    const [day, month] = await Promise.all([totals(today), totals(monthStart)]);
    return { today: day, month };
  }

  // Corridas agendadas já atribuídas a este motorista — hoje isso acontece de
  // duas formas: o despacho automático assume a corrida bem perto do horário
  // (RidesService.dispatchScheduledRides, cron de minuto em minuto), ou a
  // central atribui um motorista na hora de agendar por telefone (mesmo
  // padrão de "corrida manual" que POST /rides já usa). Não existe hoje uma
  // oferta antecipada de corrida agendada pra um motorista escolher.
  async scheduledRides(driverId: string) {
    const rides = await this.prisma.ride.findMany({
      where: { driverId, scheduledAt: { gt: new Date() }, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
      select: {
        id: true,
        status: true,
        originAddress: true,
        destinationAddress: true,
        finalPrice: true,
        scheduledAt: true,
        customer: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { scheduledAt: 'asc' },
    });
    return rides.map(withoutPhoneWhileOffered);
  }

  rideHistory(driverId: string) {
    return this.prisma.ride.findMany({
      where: { driverId },
      select: {
        id: true,
        status: true,
        originAddress: true,
        destinationAddress: true,
        finalPrice: true,
        requestedAt: true,
        customer: { select: { name: true } },
      },
      orderBy: { requestedAt: 'desc' },
      take: RIDE_HISTORY_LIMIT,
    });
  }

  private async assertOwnRide(driverId: string, rideId: string) {
    const ride = await this.rides.findOne(rideId);
    if (ride.driverId !== driverId) throw new ForbiddenException('Esta corrida não está atribuída a você');
    return ride;
  }

  async acceptRide(driverId: string, rideId: string) {
    const ride = await this.assertOwnRide(driverId, rideId);
    return this.rides.advanceStatus(rideId, { status: 'DRIVER_EN_ROUTE' }, { type: 'driver', id: driverId, label: ride.driver!.name });
  }

  async declineRide(driverId: string, rideId: string, reason?: string) {
    const ride = await this.assertOwnRide(driverId, rideId);
    return this.rides.redispatch(rideId, { type: 'driver', id: driverId, label: ride.driver!.name }, reason);
  }

  async listRideMessages(driverId: string, rideId: string) {
    await this.assertOwnRide(driverId, rideId);
    return this.rides.listMessages(rideId);
  }

  async sendRideMessage(driverId: string, rideId: string, message: string) {
    await this.assertOwnRide(driverId, rideId);
    return this.rides.sendMessage(rideId, 'driver', message);
  }

  async advanceRide(driverId: string, rideId: string, status: 'PASSENGER_ABOARD' | 'IN_PROGRESS' | 'COMPLETED') {
    const ride = await this.assertOwnRide(driverId, rideId);
    return this.rides.advanceStatus(rideId, { status }, { type: 'driver', id: driverId, label: ride.driver!.name });
  }

  // Só depois de concluída, e uma vez só — sem isso a média do cliente
  // poderia ser inflada reenviando a mesma avaliação.
  async rateCustomer(driverId: string, rideId: string, rating: number) {
    const ride = await this.assertOwnRide(driverId, rideId);
    if (ride.status !== 'COMPLETED') throw new BadRequestException('Só é possível avaliar o passageiro depois que a corrida terminar');
    if (ride.customerRating != null) throw new BadRequestException('Essa corrida já foi avaliada');

    // Condicional no banco: dois toques seguidos não gravam (nem contam na média) duas vezes.
    const marked = await this.prisma.ride.updateMany({ where: { id: rideId, customerRating: null }, data: { customerRating: rating } });
    if (marked.count === 0) throw new BadRequestException('Essa corrida já foi avaliada');

    const { _avg } = await this.prisma.ride.aggregate({
      where: { customerId: ride.customer.id, customerRating: { not: null } },
      _avg: { customerRating: true },
    });
    await this.prisma.customer.update({ where: { id: ride.customer.id }, data: { rating: _avg.customerRating } });

    return { success: true };
  }

  // Observação para a CENTRAL sobre a corrida (ex.: "cheguei mais cedo"),
  // não uma mensagem para o passageiro — isso é o chat (ver sendRideMessage/
  // RidesService.sendMessage). Vira notificação interna, mesmo canal que
  // "Fale conosco" usa.
  async sendNote(driverId: string, rideId: string, message: string) {
    const ride = await this.assertOwnRide(driverId, rideId);
    const driver = await this.drivers.findOne(driverId);
    await this.notifications.create({
      channel: 'INTERNAL',
      title: `Mensagem de ${driver.name}`,
      message,
      targetType: 'admin',
      targetId: ride.id,
    });
    return { success: true };
  }

  // Autoatendimento: diferente da senha inicial (definida pelo admin em
  // DriversService.setPassword), aqui o próprio motorista troca — por isso
  // exige a senha atual, mesma regra já aplicada no app do cliente.
  async changePassword(driverId: string, currentPassword: string, newPassword: string) {
    const driver = await this.prisma.driver.findUniqueOrThrow({ where: { id: driverId } });
    if (!driver.passwordHash || !(await bcrypt.compare(currentPassword, driver.passwordHash))) {
      throw new UnauthorizedException('Senha atual incorreta');
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.driver.update({ where: { id: driverId }, data: { passwordHash } });
    return { success: true };
  }

  // Fora do contexto de uma corrida (diferente de sendNote) — "Fale conosco"
  // geral, mesmo padrão do app do cliente: vira notificação interna, sem
  // canal de chat real.
  async sendSupportMessage(driverId: string, message: string) {
    const driver = await this.drivers.findOne(driverId);
    await this.notifications.create({
      channel: 'INTERNAL',
      title: `Mensagem de ${driver.name}`,
      message,
      targetType: 'admin',
      targetId: driverId,
      sourceType: 'driver',
      sourceId: driverId,
    });
    return { success: true };
  }

  supportMessages(driverId: string) {
    return this.notifications.findBySource('driver', driverId);
  }

  listBlockedCustomers(driverId: string) {
    return this.prisma.driverBlockedCustomer.findMany({
      where: { driverId },
      include: { customer: { select: { id: true, name: true, phone: true, rating: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async blockCustomer(driverId: string, customerId: string) {
    await this.prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    return this.prisma.driverBlockedCustomer.upsert({
      where: { driverId_customerId: { driverId, customerId } },
      create: { driverId, customerId },
      update: {},
    });
  }

  async unblockCustomer(driverId: string, customerId: string) {
    await this.prisma.driverBlockedCustomer.deleteMany({ where: { driverId, customerId } });
    return { success: true };
  }
}
