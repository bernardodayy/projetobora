import { HttpException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { stripSecrets } from '../src/common/strip-secrets';
import { throttledLogin } from '../src/common/login-throttle';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('stripSecrets', () => {
  it('removes passwordHash at any depth without touching the rest', () => {
    const out = stripSecrets({ id: 1, passwordHash: 'x', rides: [{ id: 2, driver: { passwordHash: 'y', name: 'C' } }], at: new Date('2026-01-01') });
    expect(out).toEqual({ id: 1, rides: [{ id: 2, driver: { name: 'C' } }], at: '2026-01-01T00:00:00.000Z' });
  });

  it('passes primitives and null through', () => {
    expect(stripSecrets(null)).toBeNull();
    expect(stripSecrets('ok')).toBe('ok');
  });
});

describe('throttledLogin', () => {
  const fail = () => Promise.reject(new UnauthorizedException('Credenciais inválidas'));

  it('blocks further attempts after too many failed logins, then a good login clears the counter', async () => {
    for (let i = 0; i < 8; i++) await expect(throttledLogin('t1', fail)).rejects.toThrow(UnauthorizedException);
    await expect(throttledLogin('t1', () => Promise.resolve('ok'))).rejects.toMatchObject({ status: 429 });

    // outro identificador não é afetado, e login certo zera o dele
    await expect(throttledLogin('t2', () => Promise.resolve('ok'))).resolves.toBe('ok');
    for (let i = 0; i < 7; i++) await expect(throttledLogin('t3', fail)).rejects.toThrow(UnauthorizedException);
    await expect(throttledLogin('t3', () => Promise.resolve('ok'))).resolves.toBe('ok');
    for (let i = 0; i < 7; i++) await expect(throttledLogin('t3', fail)).rejects.toThrow(UnauthorizedException);
  });

  it('does not count non-credential errors as failed logins', async () => {
    for (let i = 0; i < 12; i++) await expect(throttledLogin('t4', () => Promise.reject(new Error('db fora')))).rejects.toThrow('db fora');
    await expect(throttledLogin('t4', () => Promise.resolve('ok'))).resolves.toBe('ok');
  });
});

describe('HttpExceptionFilter', () => {
  function run(exception: unknown) {
    const json = jest.fn();
    const response = { status: jest.fn().mockReturnValue({ json }) };
    const host = { switchToHttp: () => ({ getResponse: () => response, getRequest: () => ({ method: 'GET', url: '/x' }) }) } as any;
    new HttpExceptionFilter().catch(exception, host);
    return { status: response.status.mock.calls[0][0], body: json.mock.calls[0][0] };
  }
  const known = (code: string, meta?: Record<string, unknown>) => new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 't', meta });

  it('maps prisma "not found" to 404 and unique violations to 409 instead of a generic 500', () => {
    expect(run(known('P2025')).status).toBe(404);
    const dup = run(known('P2002', { target: ['email'] }));
    expect(dup.status).toBe(409);
    expect(dup.body.message).toContain('email');
  });

  it('keeps HttpException status and body, and hides unknown errors behind a 500', () => {
    expect(run(new HttpException('nope', 418)).status).toBe(418);
    const boom = run(new Error('segredo do banco'));
    expect(boom.status).toBe(500);
    expect(boom.body.message).toBe('Erro interno do servidor');
  });
});
