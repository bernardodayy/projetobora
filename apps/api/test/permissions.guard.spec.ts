import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../src/auth/guards/permissions.guard';

function makeContext(user: any, required: string[] | undefined) {
  const reflector = { getAllAndOverride: () => required } as unknown as Reflector;
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  return { reflector, context };
}

describe('PermissionsGuard', () => {
  it('allows access when no permission is required', () => {
    const { reflector, context } = makeContext({ permissions: [] }, undefined);
    expect(new PermissionsGuard(reflector).canActivate(context)).toBe(true);
  });

  it('allows access when the user has every required permission', () => {
    const { reflector, context } = makeContext(
      { permissions: ['clientes.visualizar', 'clientes.editar'] },
      ['clientes.visualizar'],
    );
    expect(new PermissionsGuard(reflector).canActivate(context)).toBe(true);
  });

  it('denies access when a required permission is missing', () => {
    const { reflector, context } = makeContext({ permissions: ['clientes.visualizar'] }, ['tarifas.editar']);
    expect(() => new PermissionsGuard(reflector).canActivate(context)).toThrow(ForbiddenException);
  });
});
