export interface Branding {
  nomeEmpresa: string;
  corPrimaria: string;
  logoUrl: string;
}

const DEFAULT_BRAND: Branding = { nomeEmpresa: 'Central de Controle', corPrimaria: '#0D857A', logoUrl: '' };

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3333/api';

// Mesmo endpoint público que a tela de login da Central usa — mantém o app do
// cliente com a mesma marca (nome/cor/logo) configurada em Configurações →
// Sistema, sem precisar duplicar essa configuração.
export async function fetchBranding(): Promise<Branding> {
  // Curto de propósito: é o que segura a tela de abertura — servidor fora do ar não pode prender o app.
  // (AbortController + timer em vez de AbortSignal.timeout, que o Hermes/React Native não tem.)
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`${API_URL}/branding`, { signal: controller.signal });
    if (!res.ok) return DEFAULT_BRAND;
    const data = await res.json();
    return { ...DEFAULT_BRAND, ...data };
  } catch {
    return DEFAULT_BRAND;
  } finally {
    clearTimeout(timer);
  }
}
