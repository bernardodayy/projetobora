import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

interface SectionShapes {
  sistema: { nomeEmpresa: string; telefone: string; email: string; corPrimaria: string; logoUrl: string };
  despacho: { tempoOfertaSegundos: number; tempoEsperaMinutos: number; distanciaMaximaKm: number; tentativasDespacho: number; raioProcuraKm: number };
  notificacoes: { push: boolean; email: boolean; sms: boolean; internas: boolean };
}

// #0D857A é a cor padrão da marca (mesma do favicon) — trocar aqui não muda
// nada visualmente até um admin customizar em Configurações → Sistema.
const DEFAULTS: SectionShapes = {
  sistema: { nomeEmpresa: 'Central de Controle', telefone: '', email: '', corPrimaria: '#0D857A', logoUrl: '' },
  despacho: { tempoOfertaSegundos: 15, tempoEsperaMinutos: 2, distanciaMaximaKm: 30, tentativasDespacho: 3, raioProcuraKm: 5 },
  notificacoes: { push: false, email: false, sms: false, internas: true },
};

type Section = keyof SectionShapes;
type Branding = Pick<SectionShapes['sistema'], 'nomeEmpresa' | 'corPrimaria' | 'logoUrl'>;

const BRANDING_KEY = 'marca.apps';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  // Nome/cor/logo são só da equipe de desenvolvimento (BRAND_* no ambiente
  // como padrão, aba de desenvolvedor pra ajustar) — de propósito dono/admin
  // não têm caminho pra mudar isso (só telefone e e-mail de suporte).
  async getBranding(): Promise<Branding> {
    const base = DEFAULTS.sistema;
    const color = this.config.get<string>('BRAND_PRIMARY_COLOR');
    const logo = this.config.get<string>('BRAND_LOGO_URL');
    const fromEnv: Branding = {
      nomeEmpresa: this.config.get<string>('BRAND_NAME')?.trim() || base.nomeEmpresa,
      corPrimaria: color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : base.corPrimaria,
      logoUrl: logo && /^https?:\/\/.+/.test(logo) ? logo : base.logoUrl,
    };
    // O que a aba de desenvolvedor salva (DeveloperController) vale mais que o .env.
    const row = await this.prisma.systemConfiguration.findUnique({ where: { key: BRANDING_KEY } });
    return { ...fromEnv, ...((row?.value as Partial<Branding>) ?? {}) };
  }

  async updateBranding(values: Partial<Branding>, actorId: string) {
    const before = await this.getBranding();
    const merged = { ...before, ...values };
    await this.prisma.systemConfiguration.upsert({
      where: { key: BRANDING_KEY },
      update: { value: merged as any },
      create: { key: BRANDING_KEY, value: merged as any },
    });
    await this.audit.log({ actorId, action: 'UPDATE', entity: 'SystemConfiguration', entityId: BRANDING_KEY, before, after: merged });
    return merged;
  }

  async getSection<S extends Section>(section: S): Promise<SectionShapes[S]> {
    const row = await this.prisma.systemConfiguration.findUnique({ where: { key: `configuracoes.${section}` } });
    const brand = section === 'sistema' ? await this.getBranding() : {};
    return { ...DEFAULTS[section], ...((row?.value as object) ?? {}), ...brand };
  }

  async getAll() {
    const [sistema, despacho, notificacoes] = await Promise.all([
      this.getSection('sistema'),
      this.getSection('despacho'),
      this.getSection('notificacoes'),
    ]);
    return { sistema, despacho, notificacoes };
  }

  async updateSection<S extends Section>(section: S, values: Partial<SectionShapes[S]>, actorId: string) {
    const before = await this.getSection(section);
    const merged = { ...before, ...values };

    // Marca vem do ambiente (ver getBranding) — não grava cópia no banco pra
    // não existir um segundo lugar "definindo" nome/cor que engane depois.
    const { nomeEmpresa: _n, corPrimaria: _c, logoUrl: _l, ...stored } = merged as Record<string, unknown>;
    const value = section === 'sistema' ? stored : merged;

    await this.prisma.systemConfiguration.upsert({
      where: { key: `configuracoes.${section}` },
      update: { value: value as any },
      create: { key: `configuracoes.${section}`, value: value as any },
    });

    await this.audit.log({
      actorId,
      action: 'UPDATE',
      entity: 'SystemConfiguration',
      entityId: `configuracoes.${section}`,
      before,
      after: merged,
    });

    return merged;
  }

  getIntegrationsStatus() {
    return {
      googleMaps: !!this.config.get<string>('GOOGLE_MAPS_API_KEY'),
      gatewayPagamento: false,
      servicoMensagens: false,
      firebase: false,
    };
  }
}
