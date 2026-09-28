import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { round2 } from '../pricing/geometry.util';
import { CreateCouponDto } from './dto/create-coupon.dto';

@Injectable()
export class CouponsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll() {
    return this.prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async create(dto: CreateCouponDto, actorId: string) {
    const coupon = await this.prisma.coupon.create({
      data: {
        code: dto.code.toUpperCase(),
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        maxUses: dto.maxUses,
        maxUsesPerCustomer: dto.maxUsesPerCustomer,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
    });
    await this.audit.log({ actorId, action: 'CREATE', entity: 'Coupon', entityId: coupon.code, after: coupon });
    return coupon;
  }

  async setActive(code: string, active: boolean, actorId: string) {
    const before = await this.prisma.coupon.findUniqueOrThrow({ where: { code } });
    const coupon = await this.prisma.coupon.update({ where: { code }, data: { active } });
    await this.audit.log({ actorId, action: 'UPDATE', entity: 'Coupon', entityId: code, before, after: coupon });
    return coupon;
  }

  private async customerRedemptionCount(couponCode: string, customerId: string, db: Prisma.TransactionClient = this.prisma) {
    return db.couponRedemption.count({ where: { couponCode, customerId } });
  }

  // Usada no preview de tarifa e no pedido de corrida do cliente — mesma
  // validação nos dois pontos, pra não deixar o preview mostrar um desconto
  // que o pedido depois rejeita. customerId é opcional porque o preview do
  // admin (simulador de tarifa) não tem cliente nenhum — nesse caso só o
  // limite geral (maxUses) é checado, não o limite por cliente.
  async validate(code: string, basePrice: number, customerId?: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
    if (!coupon || !coupon.active) throw new BadRequestException('Cupom inválido');
    if (coupon.expiresAt && coupon.expiresAt < new Date()) throw new BadRequestException('Cupom expirado');
    if (coupon.maxUses != null && coupon.usesCount >= coupon.maxUses) throw new BadRequestException('Cupom esgotado');
    if (customerId && coupon.maxUsesPerCustomer != null) {
      const used = await this.customerRedemptionCount(coupon.code, customerId);
      if (used >= coupon.maxUsesPerCustomer) throw new BadRequestException('Você já usou esse cupom o máximo de vezes permitido');
    }

    const rawDiscount =
      coupon.discountType === 'PERCENTAGE' ? (basePrice * Number(coupon.discountValue)) / 100 : Number(coupon.discountValue);
    const discount = round2(Math.min(rawDiscount, basePrice));
    return { code: coupon.code, discount, finalPrice: round2(basePrice - discount) };
  }

  // ponytail: update condicional (WHERE usesCount < maxUses na mesma
  // instrução do incremento) em vez de ler-e-then-incrementar — o padrão
  // anterior tinha uma corrida real: duas corridas pedidas ao mesmo tempo
  // com o mesmo cupom podiam ambas passar em validate() antes de qualquer
  // uma redimir, estourando maxUses. RidesService.create chama isto dentro da
  // transação que cria a corrida (`db`), então se o cupom esgotar aqui a
  // corrida também não é criada. Só o limite por cliente ainda tem uma janela
  // minúscula (exigiria o mesmo cliente pedindo duas corridas ao mesmo tempo).
  async redeem(code: string, customerId: string, rideId: string, db: Prisma.TransactionClient = this.prisma) {
    const normalized = code.toUpperCase();
    const coupon = await db.coupon.findUniqueOrThrow({ where: { code: normalized } });

    if (coupon.maxUsesPerCustomer != null) {
      const used = await this.customerRedemptionCount(normalized, customerId, db);
      if (used >= coupon.maxUsesPerCustomer) throw new BadRequestException('Você já usou esse cupom o máximo de vezes permitido');
    }

    const result = await db.coupon.updateMany({
      where: { code: normalized, ...(coupon.maxUses != null ? { usesCount: { lt: coupon.maxUses } } : {}) },
      data: { usesCount: { increment: 1 } },
    });
    if (result.count === 0) throw new BadRequestException('Cupom esgotado');

    await db.couponRedemption.create({ data: { couponCode: normalized, customerId, rideId } });
  }

  // Corrida cancelada devolve o uso do cupom (o resgate acontece no pedido, não na
  // conclusão) — sem isso um cupom de uso único se perdia num cancelamento.
  async release(rideId: string) {
    const redemption = await this.prisma.couponRedemption.findUnique({ where: { rideId } });
    if (!redemption) return;
    await this.prisma.$transaction([
      this.prisma.couponRedemption.delete({ where: { id: redemption.id } }),
      this.prisma.coupon.update({ where: { code: redemption.couponCode }, data: { usesCount: { decrement: 1 } } }),
    ]);
  }
}
