import 'reflect-metadata';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { CustomerJwtStrategy } from '../src/customer-app/strategies/customer-jwt.strategy';
import { DriverJwtStrategy } from '../src/driver-app/strategies/driver-jwt.strategy';
import { AuthController } from '../src/auth/auth.controller';

const config = { get: () => 'segredo-de-teste' } as any;

describe('JwtStrategy (admin)', () => {
  const token = { type: 'admin' as const, sub: 'u1', email: 'velho@x.com', roleId: 'r-antigo', roleName: 'Antigo', permissions: ['clientes.editar'] };
  const dbUser = (over: any = {}) => ({
    id: 'u1', name: 'Ana', email: 'ana@x.com', status: 'ACTIVE', deletedAt: null, roleId: 'r1',
    role: { name: 'Operador', permissions: [{ permission: { slug: 'dashboard.visualizar' } }] },
    ...over,
  });
  const make = (user: any) => new JwtStrategy(config, { adminUser: { findUnique: jest.fn().mockResolvedValue(user) } } as any);

  it('uses the role the user has NOW, not what the token carried from login', async () => {
    const result = await make(dbUser()).validate(token);
    expect(result.permissions).toEqual(['dashboard.visualizar']);
    expect(result.roleName).toBe('Operador');
    expect(result.name).toBe('Ana');
    expect(result.email).toBe('ana@x.com');
  });

  it('rejects a blocked, deleted or missing user even with a valid token', async () => {
    await expect(make(dbUser({ status: 'BLOCKED' })).validate(token)).rejects.toThrow(UnauthorizedException);
    await expect(make(dbUser({ deletedAt: new Date() })).validate(token)).rejects.toThrow(UnauthorizedException);
    await expect(make(null).validate(token)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token that belongs to a driver or customer', async () => {
    await expect(make(dbUser()).validate({ ...token, type: 'driver' } as any)).rejects.toThrow(UnauthorizedException);
  });
});

describe('customer and driver strategies', () => {
  const customer = (row: any) => new CustomerJwtStrategy(config, { customer: { findUnique: jest.fn().mockResolvedValue(row) } } as any);
  const driver = (row: any) => new DriverJwtStrategy(config, { driver: { findUnique: jest.fn().mockResolvedValue(row) } } as any);
  const cPayload = { type: 'customer' as const, sub: 'c1', cpf: '1' };
  const dPayload = { type: 'driver' as const, sub: 'd1', cpf: '1' };

  it('a blocked or deleted customer loses access immediately', async () => {
    await expect(customer({ status: 'ACTIVE', deletedAt: null }).validate(cPayload)).resolves.toEqual(cPayload);
    await expect(customer({ status: 'BLOCKED', deletedAt: null }).validate(cPayload)).rejects.toThrow(UnauthorizedException);
    await expect(customer({ status: 'ACTIVE', deletedAt: new Date() }).validate(cPayload)).rejects.toThrow(UnauthorizedException);
    await expect(customer(null).validate(cPayload)).rejects.toThrow(UnauthorizedException);
  });

  it('only an approved, existing driver keeps access', async () => {
    await expect(driver({ status: 'APPROVED', deletedAt: null }).validate(dPayload)).resolves.toEqual(dPayload);
    for (const status of ['BLOCKED', 'PENDING', 'REJECTED', 'SUSPENDED']) {
      await expect(driver({ status, deletedAt: null }).validate(dPayload)).rejects.toThrow(UnauthorizedException);
    }
    await expect(driver({ status: 'APPROVED', deletedAt: new Date() }).validate(dPayload)).rejects.toThrow(UnauthorizedException);
  });

  it('does not accept a token of the wrong kind', async () => {
    await expect(customer({ status: 'ACTIVE', deletedAt: null }).validate(dPayload as any)).rejects.toThrow(UnauthorizedException);
    await expect(driver({ status: 'APPROVED', deletedAt: null }).validate(cPayload as any)).rejects.toThrow(UnauthorizedException);
  });
});

describe('GET /auth/me', () => {
  it('has the same shape as the user returned by login, with the current role and permissions', () => {
    const controller = new AuthController({} as any);
    const me = controller.me({ type: 'admin', sub: 'u1', name: 'Ana', email: 'ana@x.com', roleId: 'r1', roleName: 'Operador', permissions: ['dashboard.visualizar'] });
    expect(me).toEqual({ id: 'u1', name: 'Ana', email: 'ana@x.com', role: 'Operador', permissions: ['dashboard.visualizar'] });
  });
});
