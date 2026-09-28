import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UpdateCommissionDto } from './dto/update-commission.dto';
import { localParts, rangeBound } from '../common/timezone';
import { Page } from '../common/pagination';

const COMMISSION_KEY = 'financeiro.comissaoPercentual';
const DEFAULT_COMMISSION_PERCENT = 20;

interface TransactionFilters {
  from?: string;
  to?: string;
  driverId?: string;
  customerId?: string;
  paymentMethod?: string;
  type?: string;
  status?: string;
}

function rideWhere(filters: TransactionFilters) {
  const ride: Record<string, unknown> = {};
  if (filters.driverId) ride.driverId = filters.driverId;
  if (filters.customerId) ride.customerId = filters.customerId;
  if (filters.paymentMethod) ride.paymentMethod = filters.paymentMethod;
  return Object.keys(ride).length > 0 ? ride : undefined;
}

function dateRange(filters: TransactionFilters) {
  if (!filters.from && !filters.to) return undefined;
  return { gte: rangeBound(filters.from, 'start'), lte: rangeBound(filters.to, 'end') };
}

@Injectable()
export class FinanceiroService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getCommissionPercent(): Promise<number> {
    const config = await this.prisma.systemConfiguration.findUnique({ where: { key: COMMISSION_KEY } });
    return config ? Number(config.value) : DEFAULT_COMMISSION_PERCENT;
  }

  async updateCommissionPercent(dto: UpdateCommissionDto, actorId: string) {
    const before = await this.getCommissionPercent();
    await this.prisma.systemConfiguration.upsert({
      where: { key: COMMISSION_KEY },
      update: { value: dto.percent },
      create: { key: COMMISSION_KEY, value: dto.percent },
    });
    await this.audit.log({
      actorId,
      action: 'UPDATE',
      entity: 'SystemConfiguration',
      entityId: COMMISSION_KEY,
      before: { percent: before },
      after: { percent: dto.percent },
    });
    return { percent: dto.percent };
  }

  // Chamado pelo RidesService quando uma corrida é finalizada.
  // ponytail: sem gateway de pagamento real (Fase 6), RIDE_PAYMENT e
  // PLATFORM_FEE são reconhecidos na hora; DRIVER_PAYOUT fica PENDING até
  // alguém confirmar o repasse em "Marcar como pago".
  async generateTransactionsForRide(rideId: string) {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride || !ride.finalPrice || !ride.driverId) return;

    const exists = await this.prisma.financialTransaction.findFirst({ where: { rideId, type: 'RIDE_PAYMENT' } });
    if (exists) return;

    const commissionPercent = await this.getCommissionPercent();
    const finalPrice = Number(ride.finalPrice);
    const platformFee = Math.round(finalPrice * (commissionPercent / 100) * 100) / 100;
    const driverPayout = Math.round((finalPrice - platformFee) * 100) / 100;

    await this.prisma.financialTransaction.createMany({
      data: [
        { rideId, type: 'RIDE_PAYMENT', status: 'COMPLETED', amount: finalPrice },
        { rideId, type: 'PLATFORM_FEE', status: 'COMPLETED', amount: platformFee },
        { rideId, type: 'DRIVER_PAYOUT', status: 'PENDING', amount: driverPayout },
      ],
    });
  }

  private transactionQuery(filters: TransactionFilters) {
    const where = {
      type: filters.type as any,
      status: filters.status as any,
      createdAt: dateRange(filters),
      ride: rideWhere(filters) ? { ...rideWhere(filters) } : undefined,
    };
    const include = {
      ride: {
        select: {
          id: true,
          customer: { select: { id: true, name: true } },
          driver: { select: { id: true, name: true } },
          paymentMethod: true,
        },
      },
    };
    return { where, include };
  }

  // Últimas 200 — usado pelo app do motorista (lista de repasses); o resumo dele vem de agregação
  // (getSummary), então o total mostrado não depende desse corte.
  findTransactions(filters: TransactionFilters) {
    return this.prisma.financialTransaction.findMany({ ...this.transactionQuery(filters), orderBy: { createdAt: 'desc' }, take: 200 });
  }

  // Tabela do painel: paginada, com total.
  async listTransactions(filters: TransactionFilters, paging: { take: number; skip: number }) {
    const { where, include } = this.transactionQuery(filters);
    const [items, total] = await Promise.all([
      this.prisma.financialTransaction.findMany({ where, include, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], ...paging }), // id: desempate estável entre páginas
      this.prisma.financialTransaction.count({ where }),
    ]);
    return new Page(items, total);
  }

  async getSummary(filters: TransactionFilters) {
    const where = { createdAt: dateRange(filters), ride: rideWhere(filters) ? { ...rideWhere(filters) } : undefined };

    const [revenue, fees, payoutsPending, payoutsPaid, cancelledRides] = await Promise.all([
      this.prisma.financialTransaction.aggregate({ where: { ...where, type: 'RIDE_PAYMENT', status: 'COMPLETED' }, _sum: { amount: true } }),
      this.prisma.financialTransaction.aggregate({ where: { ...where, type: 'PLATFORM_FEE', status: 'COMPLETED' }, _sum: { amount: true } }),
      this.prisma.financialTransaction.aggregate({ where: { ...where, type: 'DRIVER_PAYOUT', status: 'PENDING' }, _sum: { amount: true } }),
      this.prisma.financialTransaction.aggregate({ where: { ...where, type: 'DRIVER_PAYOUT', status: 'COMPLETED' }, _sum: { amount: true } }),
      this.prisma.ride.count({
        where: { status: 'CANCELLED', cancelledAt: dateRange(filters), driverId: filters.driverId, customerId: filters.customerId },
      }),
    ]);

    return {
      revenue: Number(revenue._sum.amount ?? 0),
      platformFees: Number(fees._sum.amount ?? 0),
      payoutsPending: Number(payoutsPending._sum.amount ?? 0),
      payoutsPaid: Number(payoutsPaid._sum.amount ?? 0),
      cancelledRides,
    };
  }

  async getDailyRevenue(filters: TransactionFilters) {
    const where = { createdAt: dateRange(filters), type: 'RIDE_PAYMENT' as const, status: 'COMPLETED' as const, ride: rideWhere(filters) ? { ...rideWhere(filters) } : undefined };
    const transactions = await this.prisma.financialTransaction.findMany({ where, select: { amount: true, createdAt: true } });

    const byDay = new Map<string, number>();
    for (const tx of transactions) {
      const day = localParts(tx.createdAt).date;
      byDay.set(day, (byDay.get(day) ?? 0) + Number(tx.amount));
    }

    return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, amount]) => ({ date, amount: Math.round(amount * 100) / 100 }));
  }

  async settlePayout(transactionId: string, actorId: string) {
    const transaction = await this.prisma.financialTransaction.findUnique({ where: { id: transactionId } });
    if (!transaction) throw new NotFoundException('Transação não encontrada');
    if (transaction.type !== 'DRIVER_PAYOUT') throw new BadRequestException('Somente repasses a motoristas podem ser confirmados aqui');
    if (transaction.status !== 'PENDING') throw new BadRequestException('Esta transação já foi processada');

    const updated = await this.prisma.financialTransaction.update({ where: { id: transactionId }, data: { status: 'COMPLETED' } });
    await this.audit.log({ actorId, action: 'SETTLE', entity: 'FinancialTransaction', entityId: transactionId, before: transaction, after: updated });
    return updated;
  }
}
