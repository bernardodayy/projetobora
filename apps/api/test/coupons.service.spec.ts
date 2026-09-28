import { BadRequestException } from '@nestjs/common';
import { CouponsService } from '../src/coupons/coupons.service';

function makeService(coupon: any) {
  const prisma = {
    coupon: {
      findUnique: jest.fn().mockResolvedValue(coupon),
      findUniqueOrThrow: jest.fn().mockResolvedValue(coupon),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    couponRedemption: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
    },
  } as any;
  const audit = { log: jest.fn() } as any;
  return { service: new CouponsService(prisma, audit), prisma };
}

describe('CouponsService redeem', () => {
  it('rejects redemption when the atomic update affects no rows (limit hit concurrently)', async () => {
    const { service, prisma } = makeService({ code: 'PROMO10', maxUses: 5, usesCount: 5, maxUsesPerCustomer: null });
    prisma.coupon.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.redeem('promo10', 'customer-1', 'ride-1')).rejects.toThrow(BadRequestException);
    expect(prisma.coupon.updateMany).toHaveBeenCalledWith({
      where: { code: 'PROMO10', usesCount: { lt: 5 } },
      data: { usesCount: { increment: 1 } },
    });
    expect(prisma.couponRedemption.create).not.toHaveBeenCalled();
  });

  it('does not cap by usesCount when the coupon has no maxUses', async () => {
    const { service, prisma } = makeService({ code: 'FREE', maxUses: null, usesCount: 100, maxUsesPerCustomer: null });

    await service.redeem('FREE', 'customer-1', 'ride-1');
    expect(prisma.coupon.updateMany).toHaveBeenCalledWith({
      where: { code: 'FREE' },
      data: { usesCount: { increment: 1 } },
    });
  });

  it('records a redemption per ride when the coupon succeeds', async () => {
    const { service, prisma } = makeService({ code: 'PROMO10', maxUses: null, usesCount: 0, maxUsesPerCustomer: null });

    await service.redeem('PROMO10', 'customer-1', 'ride-1');
    expect(prisma.couponRedemption.create).toHaveBeenCalledWith({
      data: { couponCode: 'PROMO10', customerId: 'customer-1', rideId: 'ride-1' },
    });
  });

  it('rejects redeeming beyond the per-customer limit even if the global limit is not hit', async () => {
    const { service, prisma } = makeService({ code: 'PROMO10', maxUses: null, usesCount: 0, maxUsesPerCustomer: 1 });
    prisma.couponRedemption.count.mockResolvedValue(1);

    await expect(service.redeem('PROMO10', 'customer-1', 'ride-1')).rejects.toThrow(BadRequestException);
    expect(prisma.coupon.updateMany).not.toHaveBeenCalled();
  });
});

describe('CouponsService validate', () => {
  it('rejects when the customer already reached their per-customer limit', async () => {
    const { service, prisma } = makeService({ code: 'PROMO10', active: true, maxUses: null, usesCount: 0, maxUsesPerCustomer: 2, expiresAt: null });
    prisma.couponRedemption.count.mockResolvedValue(2);

    await expect(service.validate('PROMO10', 50, 'customer-1')).rejects.toThrow(BadRequestException);
  });

  it('allows validation without a customerId (admin fare simulator) even with a per-customer limit set', async () => {
    const { service } = makeService({ code: 'PROMO10', active: true, maxUses: null, usesCount: 0, maxUsesPerCustomer: 1, expiresAt: null, discountType: 'FIXED', discountValue: 5 });

    await expect(service.validate('PROMO10', 50)).resolves.toEqual({ code: 'PROMO10', discount: 5, finalPrice: 45 });
  });
});
