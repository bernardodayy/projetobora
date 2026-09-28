import { SettingsService } from '../src/settings/settings.service';

function makeService(env: Record<string, string | undefined>, rows: Record<string, object> = {}) {
  const prisma = {
    systemConfiguration: {
      findUnique: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(rows[where.key] ? { value: rows[where.key] } : null)),
      upsert: jest.fn(),
    },
  } as any;
  const audit = { log: jest.fn() } as any;
  const config = { get: (key: string) => env[key] } as any;
  return { service: new SettingsService(prisma, audit, config), prisma, audit };
}

describe('SettingsService branding', () => {
  it('takes name, color and logo from the environment by default', async () => {
    const { service } = makeService({ BRAND_NAME: 'BORA 25', BRAND_PRIMARY_COLOR: '#FF6B00', BRAND_LOGO_URL: 'https://x.com/logo.png' });
    await expect(service.getBranding()).resolves.toEqual({ nomeEmpresa: 'BORA 25', corPrimaria: '#FF6B00', logoUrl: 'https://x.com/logo.png' });
  });

  it('falls back to defaults when the env values are missing or invalid', async () => {
    const { service } = makeService({ BRAND_PRIMARY_COLOR: 'laranja', BRAND_LOGO_URL: 'nao-e-url' });
    await expect(service.getBranding()).resolves.toEqual({ nomeEmpresa: 'Central de Controle', corPrimaria: '#0D857A', logoUrl: '' });
  });

  it('lets what the developer tab saved override the environment', async () => {
    const { service } = makeService({ BRAND_NAME: 'Do .env' }, { 'marca.apps': { nomeEmpresa: 'Da aba', corPrimaria: '#123456' } });
    await expect(service.getBranding()).resolves.toEqual(expect.objectContaining({ nomeEmpresa: 'Da aba', corPrimaria: '#123456' }));
  });

  it('saves the developer brand under its own key and audits it', async () => {
    const { service, prisma, audit } = makeService({});
    await service.updateBranding({ nomeEmpresa: 'BORA 25', corPrimaria: '#FF6B00' }, 'dev-1');
    expect(prisma.systemConfiguration.upsert.mock.calls[0][0].where.key).toBe('marca.apps');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'dev-1', entityId: 'marca.apps' }));
  });

  it('ignores a stale brand copy in the sistema row and keeps phone/email', async () => {
    const { service } = makeService({ BRAND_NAME: 'BORA 25' }, { 'configuracoes.sistema': { nomeEmpresa: 'Antigo', telefone: '1199999' } });
    const sistema = await service.getSection('sistema');
    expect(sistema.nomeEmpresa).toBe('BORA 25');
    expect(sistema.telefone).toBe('1199999');
  });

  it('never persists brand fields when the admin saves the sistema section', async () => {
    const { service, prisma } = makeService({ BRAND_NAME: 'BORA 25' });
    await service.updateSection('sistema', { telefone: '1188888' }, 'admin-1');
    const saved = prisma.systemConfiguration.upsert.mock.calls[0][0].update.value;
    expect(saved).toEqual(expect.objectContaining({ telefone: '1188888' }));
    expect(saved).not.toHaveProperty('nomeEmpresa');
    expect(saved).not.toHaveProperty('corPrimaria');
    expect(saved).not.toHaveProperty('logoUrl');
  });
});
