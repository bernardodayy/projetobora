import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RolesService } from '../src/roles/roles.service';
import { UsersService } from '../src/users/users.service';

describe('developer-only area cannot be unlocked by owners/admins', () => {
  const audit = { log: jest.fn() } as any;

  it('rejects giving a role the developer permission (create and update)', async () => {
    const prisma = { role: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() } } as any;
    const service = new RolesService(prisma, audit);
    await expect(service.create({ name: 'Espertinho', permissionSlugs: ['desenvolvedor.marca'] } as any, 'admin-1')).rejects.toThrow(BadRequestException);
    await expect(service.update('role-1', { permissionSlugs: ['clientes.visualizar', 'desenvolvedor.marca'] } as any, 'admin-1')).rejects.toThrow(BadRequestException);
    expect(prisma.role.create).not.toHaveBeenCalled();
  });

  it('hides the developer permission and role from the Cargos screen', async () => {
    const prisma = { permission: { findMany: jest.fn().mockResolvedValue([]) }, role: { findMany: jest.fn().mockResolvedValue([]) } } as any;
    const service = new RolesService(prisma, audit);
    await service.listPermissions();
    await service.findAll();
    expect(prisma.permission.findMany.mock.calls[0][0].where).toEqual({ module: { not: 'desenvolvedor' } });
    expect(prisma.role.findMany.mock.calls[0][0].where).toEqual({ name: { not: 'Desenvolvedor' } });
  });

  it('treats the developer role as nonexistent for edits', async () => {
    const prisma = { role: { findUnique: jest.fn().mockResolvedValue({ id: 'r', name: 'Desenvolvedor', permissions: [], isSystem: true, users: [] }) } } as any;
    const service = new RolesService(prisma, audit);
    await expect(service.findOne('r')).rejects.toThrow(NotFoundException);
    await expect(service.remove('r', 'admin-1')).rejects.toThrow(NotFoundException);
  });

  it('rejects assigning the developer role to a user (create and update)', async () => {
    const prisma = {
      adminUser: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue({ id: 'u' }), create: jest.fn() },
      role: { findUnique: jest.fn().mockResolvedValue({ id: 'dev-role', name: 'Desenvolvedor' }) },
    } as any;
    const service = new UsersService(prisma, audit);
    await expect(service.create({ name: 'X', email: 'x@x.com', password: '123456', roleId: 'dev-role' } as any, 'admin-1')).rejects.toThrow(BadRequestException);
    await expect(service.update('u', { roleId: 'dev-role' } as any, 'admin-1')).rejects.toThrow(BadRequestException);
    expect(prisma.adminUser.create).not.toHaveBeenCalled();
  });

  it('hides developer accounts from the users list', async () => {
    const prisma = { adminUser: { findMany: jest.fn().mockResolvedValue([]) } } as any;
    await new UsersService(prisma, audit).findAll();
    expect(prisma.adminUser.findMany.mock.calls[0][0].where).toEqual({ deletedAt: null, role: { name: { not: 'Desenvolvedor' } } });
  });
});

describe('RolesService master role protection', () => {
  const master = { id: 'r1', name: 'Administrador Master', description: null, isSystem: true, permissions: [] };
  const service = new RolesService({ role: { findUnique: jest.fn().mockResolvedValue(master) } } as any, { log: jest.fn() } as any);

  it('refuses to strip permissions from, or rename, the Master role', async () => {
    await expect(service.update('r1', { permissionSlugs: ['dashboard.visualizar'] } as any, 'a1')).rejects.toThrow('Administrador Master');
    await expect(service.update('r1', { name: 'Outro' } as any, 'a1')).rejects.toThrow('Administrador Master');
  });
});
