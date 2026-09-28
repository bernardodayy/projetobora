export interface SistemaConfig {
  nomeEmpresa: string;
  telefone: string;
  email: string;
  corPrimaria: string;
  logoUrl: string;
}

export interface DespachoConfig {
  tempoOfertaSegundos: number;
  tempoEsperaMinutos: number;
  distanciaMaximaKm: number;
  tentativasDespacho: number;
  raioProcuraKm: number;
}

export interface NotificacoesConfig {
  push: boolean;
  email: boolean;
  sms: boolean;
  internas: boolean;
}

export interface AllSettings {
  sistema: SistemaConfig;
  despacho: DespachoConfig;
  notificacoes: NotificacoesConfig;
}

export interface IntegrationsStatus {
  googleMaps: boolean;
  gatewayPagamento: boolean;
  servicoMensagens: boolean;
  firebase: boolean;
}

export interface NotificationRow {
  id: string;
  channel: 'PUSH' | 'EMAIL' | 'SMS' | 'INTERNAL';
  title: string;
  message: string;
  sourceType: 'customer' | 'driver' | null;
  reply: string | null;
  repliedAt: string | null;
  readAt: string | null;
  createdAt: string;
}
