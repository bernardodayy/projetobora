import * as bcrypt from 'bcryptjs';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../src/auth/auth.service';

describe('AuthService.validateCredentials', () => {
  const passwordHash = bcrypt.hashSync('senha-correta', 4);

  const baseUser = {
    id: 'user-1',
    email: 'admin@central.local',
    passwordHash,
    status: 'ACTIVE',
    deletedAt: null,
    roleId: 'role-1',
    role: { id: 'role-1', name: 'Administrador Master', permissions: [] },
  };

  function makeService(user: unknown) {
    const prisma = { adminUser: { findUnique: jest.fn().mockResolvedValue(user) } } as any;
    const config = { get: () => 'test' } as unknown as ConfigService;
    const jwt = {} as JwtService;
    return new AuthService(prisma, jwt, config);
  }

  it('rejects an unknown email', async () => {
    const service = makeService(null);
    await expect(service.validateCredentials('x@x.com', 'senha-correta')).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a blocked user even with the right password', async () => {
    const service = makeService({ ...baseUser, status: 'BLOCKED' });
    await expect(service.validateCredentials(baseUser.email, 'senha-correta')).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a wrong password', async () => {
    const service = makeService(baseUser);
    await expect(service.validateCredentials(baseUser.email, 'senha-errada')).rejects.toThrow(UnauthorizedException);
  });

  it('accepts a valid email/password pair for an active user', async () => {
    const service = makeService(baseUser);
    const result = await service.validateCredentials(baseUser.email, 'senha-correta');
    expect(result.id).toBe('user-1');
  });
});
