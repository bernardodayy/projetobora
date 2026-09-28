import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEVELOPER_ROLE_NAME } from '../common/developer';

// Corrida que ainda ocupa alguém agora. Agendada pra daqui a horas fica REQUESTED até a hora chegar
// (ver RidesService.dispatchScheduledRides) — não é "em andamento".
const ONGOING_STATUSES = ['REQUESTED', 'SEARCHING_DRIVER', 'DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'PASSENGER_ABOARD', 'IN_PROGRESS'];

// Cada contador só sai para quem tem a permissão do módulo (os outros voltam null e o painel mostra
// "—"): o Dashboard não vira um jeito de espiar número de um módulo bloqueado.
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(permissions: string[]) {
    const can = (slug: string) => permissions.includes(slug);
    const count = <T>(allowed: boolean, query: () => Promise<T>): Promise<T | null> => (allowed ? query() : Promise.resolve(null));

    const [users, customers, driversApproved, driversPending, driversOnline, ridesOngoing] = await Promise.all([
      count(can('usuarios.visualizar'), () =>
        this.prisma.adminUser.count({ where: { deletedAt: null, role: { name: { not: DEVELOPER_ROLE_NAME } } } }),
      ),
      count(can('clientes.visualizar'), () => this.prisma.customer.count({ where: { deletedAt: null } })),
      count(can('motoristas.visualizar'), () => this.prisma.driver.count({ where: { deletedAt: null, status: 'APPROVED' } })),
      count(can('motoristas.visualizar'), () => this.prisma.driver.count({ where: { deletedAt: null, status: 'PENDING' } })),
      count(can('motoristas.visualizar'), () =>
        this.prisma.driver.count({ where: { deletedAt: null, status: 'APPROVED', availability: { not: 'OFFLINE' } } }),
      ),
      count(can('corridas.visualizar'), () =>
        this.prisma.ride.count({
          where: {
            status: { in: ONGOING_STATUSES as any },
            OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date(Date.now() + 60_000) } }],
          },
        }),
      ),
    ]);

    return { users, customers, driversApproved, driversPending, driversOnline, ridesOngoing };
  }
}
