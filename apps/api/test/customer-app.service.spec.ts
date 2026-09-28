import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { CustomerAppService } from '../src/customer-app/customer-app.service';

function makeService(ride: any, customer: any = {}) {
  const prisma = {
    ride: {
      findMany: jest.fn(),
      update: jest.fn().mockResolvedValue(ride),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      aggregate: jest.fn().mockResolvedValue({ _avg: { driverRating: 4.5 } }),
    },
    $transaction: jest.fn().mockResolvedValue([]),
    driver: { update: jest.fn(), findUniqueOrThrow: jest.fn() },
    customer: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(customer),
      update: jest.fn(),
    },
    customerFavoriteDriver: { findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
    customerBlockedDriver: { findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
    walletTransaction: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    customerCard: { findMany: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
  } as any;
  const customers = { findOne: jest.fn().mockResolvedValue({ id: 'customer-A', name: 'Cliente Teste' }) } as any;
  const rides = {
    findOne: jest.fn().mockResolvedValue(ride),
    cancel: jest.fn().mockResolvedValue({ ...ride, status: 'CANCELLED' }),
  } as any;
  const pricingEngine = { calculate: jest.fn().mockResolvedValue(null) } as any;
  const notifications = { create: jest.fn() } as any;
  const coupons = { validate: jest.fn(), redeem: jest.fn() } as any;
  return { service: new CustomerAppService(prisma, customers, rides, pricingEngine, notifications, coupons), prisma, rides, notifications };
}

describe('CustomerAppService ownership checks', () => {
  it('rejects cancelling a ride that belongs to a different customer', async () => {
    const { service } = makeService({ id: 'ride-1', customerId: 'customer-A' });
    await expect(service.cancelRide('customer-B', 'ride-1', 'mudei de ideia')).rejects.toThrow(ForbiddenException);
  });

  it('rejects rating a driver on a ride that belongs to a different customer', async () => {
    const { service } = makeService({ id: 'ride-1', customerId: 'customer-A' });
    await expect(service.rateDriver('customer-B', 'ride-1', 5)).rejects.toThrow(ForbiddenException);
  });

  it('allows the owning customer to cancel their own ride', async () => {
    const { service } = makeService({ id: 'ride-1', customerId: 'customer-A', status: 'REQUESTED', customer: { name: 'Maria Souza' } });
    await expect(service.cancelRide('customer-A', 'ride-1', 'mudei de ideia')).resolves.toBeDefined();
  });

  it('attributes the cancellation to the cancelling customer, not "Sistema"', async () => {
    const { service, rides } = makeService({ id: 'ride-1', customerId: 'customer-A', status: 'REQUESTED', customer: { name: 'Maria Souza' } });
    await service.cancelRide('customer-A', 'ride-1', 'mudei de ideia');
    expect(rides.cancel).toHaveBeenCalledWith(
      'ride-1',
      { reason: 'mudei de ideia' },
      { type: 'customer', id: 'customer-A', label: 'Maria Souza' },
    );
  });
});

describe('CustomerAppService rateDriver', () => {
  const completedRide = { id: 'ride-1', customerId: 'customer-A', driverId: 'driver-1', status: 'COMPLETED', driverRating: null };

  it('rejects rating before the ride is completed', async () => {
    const { service } = makeService({ ...completedRide, status: 'IN_PROGRESS' });
    await expect(service.rateDriver('customer-A', 'ride-1', 5)).rejects.toThrow(BadRequestException);
  });

  it('rejects rating the same ride twice', async () => {
    const { service } = makeService({ ...completedRide, driverRating: 4 });
    await expect(service.rateDriver('customer-A', 'ride-1', 5)).rejects.toThrow(BadRequestException);
  });

  it('recomputes the driver average after rating', async () => {
    const { service, prisma } = makeService(completedRide);
    await service.rateDriver('customer-A', 'ride-1', 5);
    expect(prisma.ride.updateMany).toHaveBeenCalledWith({ where: { id: 'ride-1', driverRating: null }, data: { driverRating: 5 } });
    expect(prisma.driver.update).toHaveBeenCalledWith({ where: { id: 'driver-1' }, data: { rating: 4.5 } });
  });
});

describe('CustomerAppService rating race', () => {
  it('rejects a second rating that lands after the first one was already stored', async () => {
    const { service, prisma } = makeService({ id: 'ride-1', customerId: 'customer-A', status: 'COMPLETED', driverId: 'driver-1', driverRating: null });
    prisma.ride.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.rateDriver('customer-A', 'ride-1', 5)).rejects.toThrow(BadRequestException);
    expect(prisma.driver.update).not.toHaveBeenCalled();
  });
});

describe('CustomerAppService currentRide', () => {
  it('falls back to a recently cancelled ride so the customer learns why nobody came', async () => {
    const { service, prisma } = makeService(null);
    prisma.ride.findFirst = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'ride-1', status: 'CANCELLED' });

    const ride = await service.currentRide('customer-A');

    expect(ride).toEqual({ id: 'ride-1', status: 'CANCELLED' });
    const fallback = prisma.ride.findFirst.mock.calls[1][0].where;
    expect(fallback.status).toBe('CANCELLED');
    expect(fallback.cancelledAt.gte).toBeInstanceOf(Date);
  });

  it('prefers an active ride over a cancelled one', async () => {
    const { service, prisma } = makeService(null);
    prisma.ride.findFirst = jest.fn().mockResolvedValueOnce({ id: 'ride-2', status: 'DRIVER_ASSIGNED' });
    await expect(service.currentRide('customer-A')).resolves.toMatchObject({ id: 'ride-2' });
    expect(prisma.ride.findFirst).toHaveBeenCalledTimes(1);
  });
});

describe('CustomerAppService driver phone', () => {
  const driver = { id: 'd1', name: 'Carlos', phone: '11988887777', vehicles: [] };

  it('hides the driver phone while the driver has not accepted yet', async () => {
    const { service, prisma } = makeService(null);
    prisma.ride.findFirst = jest.fn().mockResolvedValueOnce({ id: 'ride-1', status: 'DRIVER_ASSIGNED', driver });
    const ride: any = await service.currentRide('customer-A');
    expect(ride.driver.phone).toBeUndefined();
    expect(ride.driver.name).toBe('Carlos');
  });

  it('shows it once the driver is on the way', async () => {
    const { service, prisma } = makeService(null);
    prisma.ride.findFirst = jest.fn().mockResolvedValueOnce({ id: 'ride-1', status: 'DRIVER_EN_ROUTE', driver });
    const ride: any = await service.currentRide('customer-A');
    expect(ride.driver.phone).toBe('11988887777');
  });

  it('copes with a ride that has no driver yet', async () => {
    const { service, prisma } = makeService(null);
    prisma.ride.findFirst = jest.fn().mockResolvedValueOnce({ id: 'ride-1', status: 'SEARCHING_DRIVER', driver: null });
    await expect(service.currentRide('customer-A')).resolves.toMatchObject({ id: 'ride-1', driver: null });
  });
});

describe('CustomerAppService driver Pix key', () => {
  const driver = { id: 'd1', name: 'Carlos', phone: '11988887777', pixKey: 'carlos@pix.com', vehicles: [] };
  const current = async (ride: any) => {
    const { service, prisma } = makeService(null);
    prisma.ride.findFirst = jest.fn().mockResolvedValueOnce(ride);
    return (await service.currentRide('customer-A')) as any;
  };

  it('shows the key once the driver accepted a Pix ride', async () => {
    expect((await current({ id: 'r', status: 'DRIVER_EN_ROUTE', paymentMethod: 'PIX', driver })).driver.pixKey).toBe('carlos@pix.com');
    expect((await current({ id: 'r', status: 'IN_PROGRESS', paymentMethod: 'PIX', driver })).driver.pixKey).toBe('carlos@pix.com');
  });

  it('keeps it hidden while the ride is only an offer', async () => {
    expect((await current({ id: 'r', status: 'DRIVER_ASSIGNED', paymentMethod: 'PIX', driver })).driver.pixKey).toBeUndefined();
  });

  it('never sends it on rides paid another way', async () => {
    for (const paymentMethod of ['CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'WALLET', null]) {
      expect((await current({ id: 'r', status: 'DRIVER_EN_ROUTE', paymentMethod, driver })).driver.pixKey).toBeUndefined();
    }
  });

  it('shows no driver contact on a cancelled ride', async () => {
    const ride = await current({ id: 'r', status: 'CANCELLED', paymentMethod: 'PIX', driver });
    expect(ride.driver.pixKey).toBeUndefined();
    expect(ride.driver.phone).toBeUndefined();
  });
});

describe('CustomerAppService cancel window', () => {
  it('does not let the passenger cancel once the trip is in progress', async () => {
    const { service, rides } = makeService({ id: 'ride-1', customerId: 'customer-A', status: 'IN_PROGRESS', customer: { name: 'X' } });
    await expect(service.cancelRide('customer-A', 'ride-1', 'desisti')).rejects.toThrow(BadRequestException);
    expect(rides.cancel).not.toHaveBeenCalled();
  });
});

describe('CustomerAppService changePassword', () => {
  it('rejects the wrong current password', async () => {
    const passwordHash = await bcrypt.hash('senha-certa', 10);
    const { service } = makeService(null, { passwordHash });
    await expect(service.changePassword('customer-A', 'senha-errada', 'nova-senha')).rejects.toThrow(UnauthorizedException);
  });

  it('updates the hash when the current password matches', async () => {
    const passwordHash = await bcrypt.hash('senha-certa', 10);
    const { service, prisma } = makeService(null, { passwordHash });
    await service.changePassword('customer-A', 'senha-certa', 'nova-senha');
    expect(prisma.customer.update).toHaveBeenCalledWith({ where: { id: 'customer-A' }, data: { passwordHash: expect.any(String) } });
  });
});

describe('CustomerAppService sendSupportMessage', () => {
  it('creates an internal notification for the central', async () => {
    const { service, notifications } = makeService(null);
    await service.sendSupportMessage('customer-A', 'preciso de ajuda');
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'INTERNAL', message: 'preciso de ajuda', targetType: 'admin', targetId: 'customer-A' }),
    );
  });
});

describe('CustomerAppService wallet', () => {
  it('credits the balance and records a topup transaction', async () => {
    const { service, prisma } = makeService(null, { walletBalance: 10 });
    await service.topUpWallet('customer-A', 20);
    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: 'customer-A' },
      data: { walletBalance: { increment: 20 } },
    });
    expect(prisma.walletTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ customerId: 'customer-A', type: 'TOPUP', amount: 20 }) }),
    );
  });
});

describe('CustomerAppService cards', () => {
  it('never persists more than a display label for a card', async () => {
    const { service, prisma } = makeService(null);
    await service.addCard('customer-A', { brand: 'Visa', last4: '4242', expiry: '09/30' });
    expect(prisma.customerCard.create).toHaveBeenCalledWith({
      data: { customerId: 'customer-A', brand: 'Visa', last4: '4242', expiry: '09/30' },
    });
  });
});
