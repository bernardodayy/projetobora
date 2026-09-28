import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CustomersService } from '../customers/customers.service';
import { RidesService } from '../rides/rides.service';
import { PricingEngineService } from '../pricing/pricing-engine.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CouponsService } from '../coupons/coupons.service';
import { CreateAddressDto } from '../customers/dto/create-address.dto';
import { UpdateAddressDto } from '../customers/dto/update-address.dto';
import { RequestRideDto } from './dto/request-ride.dto';
import { AddCardDto } from './dto/add-card.dto';

// Tudo que não é REQUESTED nem finalizado é "em andamento" do ponto de vista
// do cliente — diferente do motorista, que só passa a ter "corrida atual"
// depois de atribuído.
const ACTIVE_RIDE_STATUSES = ['REQUESTED', 'SEARCHING_DRIVER', 'DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'PASSENGER_ABOARD', 'IN_PROGRESS'];

// ponytail: sem paginação de verdade ainda, mesmo limite usado nas listas do admin.
const RIDE_HISTORY_LIMIT = 50;

// Por quanto tempo uma corrida cancelada continua aparecendo como "atual" (até o cliente dispensar).
const RECENT_CANCEL_MS = 10 * 60_000;

// Mesma regra do lado do motorista (ver DriverAppService): telefone do motorista só depois que ele aceita.
// A chave Pix segue a mesma regra e ainda só vai numa corrida paga no Pix — nas outras formas de pagamento
// o passageiro não tem o que fazer com ela.
const hideDriverPrivateData = <T extends { status: string; paymentMethod?: string | null; driver: { phone?: string; pixKey?: string | null } | null }>(ride: T | null): T | null => {
  if (!ride?.driver) return ride;
  // Só oferta (ainda pode recusar) ou corrida já cancelada: nada de contato do motorista.
  const offered = ride.status === 'DRIVER_ASSIGNED' || ride.status === 'CANCELLED';
  const showPix = !offered && ride.paymentMethod === 'PIX';
  return { ...ride, driver: { ...ride.driver, phone: offered ? undefined : ride.driver.phone, pixKey: showPix ? ride.driver.pixKey : undefined } };
};

@Injectable()
export class CustomerAppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
    private readonly rides: RidesService,
    private readonly pricingEngine: PricingEngineService,
    private readonly notifications: NotificationsService,
    private readonly coupons: CouponsService,
  ) {}

  me(customerId: string) {
    return this.customers.findOne(customerId);
  }

  async listAddresses(customerId: string) {
    const customer = await this.customers.findOne(customerId);
    return customer.addresses;
  }

  addAddress(customerId: string, dto: CreateAddressDto) {
    return this.customers.addAddress(customerId, dto);
  }

  updateAddress(customerId: string, addressId: string, dto: UpdateAddressDto) {
    return this.customers.updateAddress(customerId, addressId, dto);
  }

  removeAddress(customerId: string, addressId: string) {
    return this.customers.removeAddress(customerId, addressId);
  }

  async previewFare(originLat: number, originLng: number, destinationLat: number, destinationLng: number, couponCode?: string, customerId?: string) {
    const pricing = await this.pricingEngine
      .calculate({ lat: originLat, lng: originLng }, { lat: destinationLat, lng: destinationLng }, new Date())
      .catch(() => null); // sem configuração de tarifa ativa: sem estimativa, mas não impede pedir a corrida
    if (!pricing) return pricing;

    // Diferente do pedido de corrida (que rejeita cupom inválido), o preview só
    // não mostra desconto — o cliente ainda pode tentar pedir sem cupom.
    if (couponCode) {
      const applied = await this.coupons.validate(couponCode, pricing.finalPrice, customerId).catch(() => null);
      if (applied) return { ...pricing, couponCode: applied.code, discount: applied.discount, finalPrice: applied.finalPrice };
    }
    return pricing;
  }

  async currentRide(customerId: string) {
    // Diferente do motorista (que fecha a corrida com o próprio toque em
    // "Finalizar"), aqui quem termina a corrida é o motorista — o cliente só
    // fica sabendo pelo socket/poll. Por isso "atual" também inclui a
    // corrida recém-concluída enquanto ainda não foi avaliada: é o gancho
    // que a tela de avaliação usa para aparecer sem estado local nenhum.
    //
    // Uma corrida agendada pra daqui a horas fica REQUESTED até o cron
    // despachar (ver RidesService.dispatchScheduledRides) — sem o filtro de
    // scheduledAt abaixo ela apareceria aqui como se já estivesse rolando.
    const include = {
      driver: { select: { id: true, name: true, phone: true, pixKey: true, rating: true, lastLat: true, lastLng: true, vehicles: { take: 1 } } },
      // Só status + hora: metadata dos eventos guarda ids e motivos de recusa de outros motoristas.
      events: { select: { id: true, status: true, createdAt: true }, orderBy: { createdAt: 'asc' as const } },
    };
    const active = await this.prisma.ride.findFirst({
      where: {
        customerId,
        OR: [
          { status: { in: ACTIVE_RIDE_STATUSES as any }, OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date(Date.now() + 60_000) } }] },
          { status: 'COMPLETED', driverRating: null },
        ],
      },
      include,
      orderBy: { requestedAt: 'desc' },
    });
    if (active) return hideDriverPrivateData(active);

    // Cancelada há pouco (o despacho cancela sozinho quando ninguém aceita, ou a central cancelou): o
    // cliente precisa ficar sabendo por quê — o app mostra o aviso até ele dispensar.
    const cancelled = await this.prisma.ride.findFirst({
      where: { customerId, status: 'CANCELLED', cancelledAt: { gte: new Date(Date.now() - RECENT_CANCEL_MS) } },
      include,
      orderBy: { cancelledAt: 'desc' },
    });
    return hideDriverPrivateData(cancelled);
  }

  async requestRide(customerId: string, dto: RequestRideDto) {
    const customer = await this.customers.findOne(customerId);
    return this.rides.create({ ...dto, customerId }, { type: 'customer', id: customerId, label: customer.name });
  }

  private async assertOwnRide(customerId: string, rideId: string) {
    const ride = await this.rides.findOne(rideId);
    if (ride.customerId !== customerId) throw new ForbiddenException('Esta corrida não é sua');
    return ride;
  }

  async cancelRide(customerId: string, rideId: string, reason: string) {
    const ride = await this.assertOwnRide(customerId, rideId);
    // Depois que a viagem começa quem encerra é a central: sem isso o passageiro
    // cancelava no meio do trajeto e a corrida saía sem cobrança nem repasse.
    if (ride.status === 'IN_PROGRESS') throw new BadRequestException('A corrida já começou — fale com a central se precisar encerrá-la.');
    return this.rides.cancel(rideId, { reason }, { type: 'customer', id: customerId, label: ride.customer.name });
  }

  async listRideMessages(customerId: string, rideId: string) {
    await this.assertOwnRide(customerId, rideId);
    return this.rides.listMessages(rideId);
  }

  async sendRideMessage(customerId: string, rideId: string, message: string) {
    await this.assertOwnRide(customerId, rideId);
    return this.rides.sendMessage(rideId, 'customer', message);
  }

  // Só depois de concluída, e uma vez só — mesma regra do lado do motorista
  // (DriverAppService.rateCustomer), só que na direção contrária.
  async rateDriver(customerId: string, rideId: string, rating: number) {
    const ride = await this.assertOwnRide(customerId, rideId);
    if (ride.status !== 'COMPLETED') throw new BadRequestException('Só é possível avaliar o motorista depois que a corrida terminar');
    if (!ride.driverId) throw new BadRequestException('Esta corrida não teve motorista atribuído');
    if (ride.driverRating != null) throw new BadRequestException('Essa corrida já foi avaliada');

    // Condicional no banco: dois toques seguidos não gravam (nem contam na média) duas vezes.
    const marked = await this.prisma.ride.updateMany({ where: { id: rideId, driverRating: null }, data: { driverRating: rating } });
    if (marked.count === 0) throw new BadRequestException('Essa corrida já foi avaliada');

    const { _avg } = await this.prisma.ride.aggregate({
      where: { driverId: ride.driverId, driverRating: { not: null } },
      _avg: { driverRating: true },
    });
    await this.prisma.driver.update({ where: { id: ride.driverId }, data: { rating: _avg.driverRating } });

    return { success: true };
  }

  rideHistory(customerId: string) {
    return this.prisma.ride.findMany({
      where: { customerId },
      select: {
        id: true,
        status: true,
        originAddress: true,
        destinationAddress: true,
        finalPrice: true,
        requestedAt: true,
        scheduledAt: true,
        driver: { select: { name: true } },
      },
      orderBy: { requestedAt: 'desc' },
      take: RIDE_HISTORY_LIMIT,
    });
  }

  // Autoatendimento: diferente da senha inicial (definida pelo admin no
  // cadastro), aqui o próprio cliente troca — por isso exige a senha atual,
  // não só a nova.
  async changePassword(customerId: string, currentPassword: string, newPassword: string) {
    const customer = await this.prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    if (!customer.passwordHash || !(await bcrypt.compare(currentPassword, customer.passwordHash))) {
      throw new UnauthorizedException('Senha atual incorreta');
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.customer.update({ where: { id: customerId }, data: { passwordHash } });
    return { success: true };
  }

  // Mesma ideia do "enviar observação" do motorista (ver DriverAppService.sendNote):
  // sem canal de suporte real configurado em lugar nenhum do sistema ainda, isso
  // vira notificação interna para a central em vez de fingir um chat/e-mail.
  async sendSupportMessage(customerId: string, message: string) {
    const customer = await this.customers.findOne(customerId);
    await this.notifications.create({
      channel: 'INTERNAL',
      title: `Mensagem de ${customer.name}`,
      message,
      targetType: 'admin',
      targetId: customerId,
      sourceType: 'customer',
      sourceId: customerId,
    });
    return { success: true };
  }

  supportMessages(customerId: string) {
    return this.notifications.findBySource('customer', customerId);
  }

  listFavoriteDrivers(customerId: string) {
    return this.prisma.customerFavoriteDriver.findMany({
      where: { customerId },
      include: { driver: { select: { id: true, name: true, phone: true, rating: true, vehicles: { take: 1 } } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addFavoriteDriver(customerId: string, driverId: string) {
    await this.prisma.driver.findUniqueOrThrow({ where: { id: driverId } });
    return this.prisma.customerFavoriteDriver.upsert({
      where: { customerId_driverId: { customerId, driverId } },
      create: { customerId, driverId },
      update: {},
    });
  }

  async removeFavoriteDriver(customerId: string, driverId: string) {
    await this.prisma.customerFavoriteDriver.deleteMany({ where: { customerId, driverId } });
    return { success: true };
  }

  listBlockedDrivers(customerId: string) {
    return this.prisma.customerBlockedDriver.findMany({
      where: { customerId },
      include: { driver: { select: { id: true, name: true, phone: true, rating: true, vehicles: { take: 1 } } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async blockDriver(customerId: string, driverId: string) {
    await this.prisma.driver.findUniqueOrThrow({ where: { id: driverId } });
    return this.prisma.customerBlockedDriver.upsert({
      where: { customerId_driverId: { customerId, driverId } },
      create: { customerId, driverId },
      update: {},
    });
  }

  async unblockDriver(customerId: string, driverId: string) {
    await this.prisma.customerBlockedDriver.deleteMany({ where: { customerId, driverId } });
    return { success: true };
  }

  async getWallet(customerId: string) {
    const customer = await this.prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    const transactions = await this.prisma.walletTransaction.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: RIDE_HISTORY_LIMIT,
    });
    return { balance: Number(customer.walletBalance), transactions };
  }

  // ponytail: recarga é só um número no banco, sem gateway de pagamento real
  // por trás — mesma honestidade já aplicada em Ride.paymentMethod (rótulo, não
  // cobrança de verdade). Fica pronto para plugar um gateway depois.
  async topUpWallet(customerId: string, amount: number) {
    await this.prisma.$transaction([
      this.prisma.customer.update({ where: { id: customerId }, data: { walletBalance: { increment: amount } } }),
      this.prisma.walletTransaction.create({
        data: { customerId, type: 'TOPUP', amount, description: 'Recarga de carteira' },
      }),
    ]);
    return this.getWallet(customerId);
  }

  listCards(customerId: string) {
    return this.prisma.customerCard.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' } });
  }

  addCard(customerId: string, dto: AddCardDto) {
    return this.prisma.customerCard.create({ data: { customerId, ...dto } });
  }

  async removeCard(customerId: string, cardId: string) {
    await this.prisma.customerCard.deleteMany({ where: { id: cardId, customerId } });
    return { success: true };
  }
}
