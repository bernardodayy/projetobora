import { of, lastValueFrom } from 'rxjs';
import { Page, PaginationInterceptor, paging } from '../src/common/pagination';
import { CustomersService } from '../src/customers/customers.service';
import { DriversService } from '../src/drivers/drivers.service';
import { RidesService } from '../src/rides/rides.service';
import { FinanceiroService } from '../src/financeiro/financeiro.service';
import { AuditService } from '../src/audit/audit.service';
import { DashboardService } from '../src/dashboard/dashboard.service';

describe('paging', () => {
  it('defaults to the old 200-row ceiling so callers that send nothing see no change', () => {
    expect(paging()).toEqual({ take: 200, skip: 0 });
  });

  it('turns page/pageSize into take/skip', () => {
    expect(paging('3', '25')).toEqual({ take: 25, skip: 50 });
  });

  it('caps the page size and shrugs off garbage', () => {
    expect(paging('1', '99999').take).toBe(1000);
    expect(paging('abc', '-5', 50)).toEqual({ take: 50, skip: 0 });
    expect(paging('0', '0')).toEqual({ take: 200, skip: 0 });
  });
});

describe('PaginationInterceptor', () => {
  const run = async (data: unknown) => {
    const response = { setHeader: jest.fn() };
    const context = { switchToHttp: () => ({ getResponse: () => response }) } as any;
    const body = await lastValueFrom(new PaginationInterceptor().intercept(context, { handle: () => of(data) }));
    return { body, response };
  };

  it('sends the rows as the body and the total in X-Total-Count', async () => {
    const { body, response } = await run(new Page([{ id: 1 }], 137));
    expect(body).toEqual([{ id: 1 }]);
    expect(response.setHeader).toHaveBeenCalledWith('X-Total-Count', '137');
  });

  it('leaves any other response untouched', async () => {
    const { body, response } = await run({ ok: true });
    expect(body).toEqual({ ok: true });
    expect(response.setHeader).not.toHaveBeenCalled();
  });
});

describe('paginated services', () => {
  const rows = [{ id: 'a' }];
  const model = () => ({ findMany: jest.fn().mockResolvedValue(rows), count: jest.fn().mockResolvedValue(42) });

  it('customers: same filter for the page and the total', async () => {
    const prisma = { customer: model() } as any;
    const page = await new CustomersService(prisma, {} as any).findAll({ name: 'ana' }, { take: 25, skip: 50 });

    expect(page).toBeInstanceOf(Page);
    expect(page.total).toBe(42);
    const { where, take, skip } = prisma.customer.findMany.mock.calls[0][0];
    expect({ take, skip }).toEqual({ take: 25, skip: 50 });
    expect(prisma.customer.count).toHaveBeenCalledWith({ where });
  });

  it('drivers: same filter for the page and the total', async () => {
    const prisma = { driver: model() } as any;
    const page = await new DriversService(prisma, {} as any, {} as any, {} as any).findAll({ status: 'APPROVED' }, { take: 10, skip: 0 });

    expect(page.total).toBe(42);
    const { where } = prisma.driver.findMany.mock.calls[0][0];
    expect(where.status).toBe('APPROVED');
    expect(prisma.driver.count).toHaveBeenCalledWith({ where });
  });

  it('rides: paginates and counts with the date range applied to both', async () => {
    const prisma = { ride: model() } as any;
    const service = new RidesService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    const page = await service.findAll({ from: '2026-09-01', to: '2026-09-26' }, { take: 25, skip: 25 });

    expect(page.total).toBe(42);
    const { where } = prisma.ride.findMany.mock.calls[0][0];
    expect(where.requestedAt.lte.toISOString()).toBe('2026-09-27T02:59:59.999Z');
    expect(prisma.ride.count).toHaveBeenCalledWith({ where });
  });

  it('financeiro: the panel table is paginated, the driver app list keeps its own 200 cap', async () => {
    const prisma = { financialTransaction: model() } as any;
    const service = new FinanceiroService(prisma, {} as any);

    const page = await service.listTransactions({ type: 'DRIVER_PAYOUT' }, { take: 25, skip: 25 });
    expect(page.total).toBe(42);
    expect(prisma.financialTransaction.findMany.mock.calls[0][0]).toMatchObject({ take: 25, skip: 25 });

    await service.findTransactions({ driverId: 'd1' });
    expect(prisma.financialTransaction.findMany.mock.calls[1][0].take).toBe(200);
  });

  it('audit: returns the total so the screen can page through everything', async () => {
    const prisma = { auditLog: model() } as any;
    const page = await new AuditService(prisma).findAll({ entity: 'Ride', take: 50, skip: 100 });
    expect(page.total).toBe(42);
    expect(prisma.auditLog.count).toHaveBeenCalledWith({ where: { entity: 'Ride' } });
  });
});

describe('DashboardService', () => {
  const makePrisma = () => ({
    adminUser: { count: jest.fn().mockResolvedValue(3) },
    customer: { count: jest.fn().mockResolvedValue(1234) },
    driver: { count: jest.fn().mockResolvedValue(7) },
    ride: { count: jest.fn().mockResolvedValue(9) },
  });

  it('counts everything for a user who can see every module', async () => {
    const prisma = makePrisma() as any;
    const all = ['usuarios.visualizar', 'clientes.visualizar', 'motoristas.visualizar', 'corridas.visualizar'];
    const result = await new DashboardService(prisma).summary(all);
    expect(result).toEqual({ users: 3, customers: 1234, driversApproved: 7, driversPending: 7, driversOnline: 7, ridesOngoing: 9 });
  });

  it('does not count (or reveal) modules the user cannot see', async () => {
    const prisma = makePrisma() as any;
    const result = await new DashboardService(prisma).summary(['corridas.visualizar']);
    expect(result).toEqual({ users: null, customers: null, driversApproved: null, driversPending: null, driversOnline: null, ridesOngoing: 9 });
    expect(prisma.customer.count).not.toHaveBeenCalled();
    expect(prisma.driver.count).not.toHaveBeenCalled();
  });

  it('does not treat a ride scheduled for later as ongoing', async () => {
    const prisma = makePrisma() as any;
    await new DashboardService(prisma).summary(['corridas.visualizar']);
    const { where } = prisma.ride.count.mock.calls[0][0];
    expect(where.OR).toEqual([{ scheduledAt: null }, { scheduledAt: { lte: expect.any(Date) } }]);
    expect(where.status.in).not.toContain('COMPLETED');
  });
});

describe('stable ordering across pages', () => {
  it('breaks date ties by id in every paginated list (rows created together must not repeat or vanish between pages)', async () => {
    const model = () => ({ findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) });
    const p = { customer: model(), driver: model(), ride: model(), financialTransaction: model(), auditLog: model(), notification: model() } as any;
    const paging = { take: 10, skip: 0 };

    await new CustomersService(p, {} as any).findAll({}, paging);
    await new DriversService(p, {} as any, {} as any, {} as any).findAll({}, paging);
    await new RidesService(p, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any).findAll({}, paging);
    await new FinanceiroService(p, {} as any).listTransactions({}, paging);
    await new AuditService(p).findAll({ ...paging });
    const { NotificationsService } = await import('../src/notifications/notifications.service');
    await new NotificationsService(p, {} as any).findAll(paging);

    for (const key of Object.keys(p)) {
      const { orderBy } = p[key].findMany.mock.calls[0][0];
      expect(Array.isArray(orderBy) && orderBy[orderBy.length - 1]).toEqual({ id: 'asc' });
    }
  });
});
