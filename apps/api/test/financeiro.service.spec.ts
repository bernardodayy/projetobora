import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FinanceiroService } from '../src/financeiro/financeiro.service';

function makeService({ config = null, ride = null, existingTx = null, transaction = null }: any = {}) {
  const prisma = {
    systemConfiguration: { findUnique: jest.fn().mockResolvedValue(config), upsert: jest.fn() },
    ride: { findUnique: jest.fn().mockResolvedValue(ride) },
    financialTransaction: {
      findFirst: jest.fn().mockResolvedValue(existingTx),
      createMany: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(transaction),
      update: jest.fn().mockResolvedValue({ ...transaction, status: 'COMPLETED' }),
    },
  } as any;
  const audit = { log: jest.fn() } as any;
  return { service: new FinanceiroService(prisma, audit), prisma };
}

describe('FinanceiroService.generateTransactionsForRide', () => {
  it('splits the ride price into platform fee and driver payout using the configured commission', async () => {
    const ride = { id: 'ride-1', finalPrice: 100, driverId: 'driver-1' };
    const { service, prisma } = makeService({ config: { value: 25 }, ride });

    await service.generateTransactionsForRide('ride-1');

    expect(prisma.financialTransaction.createMany).toHaveBeenCalledWith({
      data: [
        { rideId: 'ride-1', type: 'RIDE_PAYMENT', status: 'COMPLETED', amount: 100 },
        { rideId: 'ride-1', type: 'PLATFORM_FEE', status: 'COMPLETED', amount: 25 },
        { rideId: 'ride-1', type: 'DRIVER_PAYOUT', status: 'PENDING', amount: 75 },
      ],
    });
  });

  it('does nothing when the ride has no price yet', async () => {
    const ride = { id: 'ride-1', finalPrice: null, driverId: 'driver-1' };
    const { service, prisma } = makeService({ ride });

    await service.generateTransactionsForRide('ride-1');

    expect(prisma.financialTransaction.createMany).not.toHaveBeenCalled();
  });

  it('does nothing when the ride never had a driver assigned', async () => {
    const ride = { id: 'ride-1', finalPrice: 100, driverId: null };
    const { service, prisma } = makeService({ ride });

    await service.generateTransactionsForRide('ride-1');

    expect(prisma.financialTransaction.createMany).not.toHaveBeenCalled();
  });

  it('does not duplicate transactions if called twice for the same ride', async () => {
    const ride = { id: 'ride-1', finalPrice: 100, driverId: 'driver-1' };
    const { service, prisma } = makeService({ ride, existingTx: { id: 'tx-1' } });

    await service.generateTransactionsForRide('ride-1');

    expect(prisma.financialTransaction.createMany).not.toHaveBeenCalled();
  });
});

describe('FinanceiroService.settlePayout', () => {
  it('rejects settling a transaction that is not a driver payout', async () => {
    const { service } = makeService({ transaction: { id: 'tx-1', type: 'PLATFORM_FEE', status: 'PENDING' } });
    await expect(service.settlePayout('tx-1', 'admin-1')).rejects.toThrow(BadRequestException);
  });

  it('rejects settling a payout that was already settled', async () => {
    const { service } = makeService({ transaction: { id: 'tx-1', type: 'DRIVER_PAYOUT', status: 'COMPLETED' } });
    await expect(service.settlePayout('tx-1', 'admin-1')).rejects.toThrow(BadRequestException);
  });

  it('rejects settling a transaction that does not exist', async () => {
    const { service } = makeService({ transaction: null });
    await expect(service.settlePayout('tx-1', 'admin-1')).rejects.toThrow(NotFoundException);
  });

  it('settles a pending driver payout', async () => {
    const { service } = makeService({ transaction: { id: 'tx-1', type: 'DRIVER_PAYOUT', status: 'PENDING' } });
    await expect(service.settlePayout('tx-1', 'admin-1')).resolves.toBeDefined();
  });
});

describe('FinanceiroService daily revenue timezone', () => {
  it('buckets a 22:00 (Brasília) payment on that day, not on the next UTC day', async () => {
    const prisma = { financialTransaction: { findMany: jest.fn().mockResolvedValue([{ amount: 40, createdAt: new Date('2026-09-26T01:00:00Z') }]) } } as any;
    const service = new FinanceiroService(prisma, {} as any);
    expect(await service.getDailyRevenue({})).toEqual([{ date: '2026-09-25', amount: 40 }]);
  });

  it('treats a date-only "to" filter as the whole last day', async () => {
    const prisma = { financialTransaction: { findMany: jest.fn().mockResolvedValue([]) } } as any;
    const service = new FinanceiroService(prisma, {} as any);
    await service.getDailyRevenue({ from: '2026-09-01', to: '2026-09-26' });
    const { createdAt } = prisma.financialTransaction.findMany.mock.calls[0][0].where;
    expect(createdAt.gte.toISOString()).toBe('2026-09-01T03:00:00.000Z');
    expect(createdAt.lte.toISOString()).toBe('2026-09-27T02:59:59.999Z');
  });
});
