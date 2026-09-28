// Mesmo sistema visual do app do cliente (ver apps/customer/src/theme.ts) —
// os dois compartilham a mesma marca, então usam a mesma paleta/tipografia/
// espaçamento. Cor de marca (brand.corPrimaria) continua vindo da API, só o
// resto do sistema visual mora aqui.
export const colors = {
  background: '#FAF9F7',
  surface: '#FFFFFF',
  surfaceMuted: '#F4F2EF',
  border: '#EBE8E3',
  textPrimary: '#1B1912',
  textSecondary: '#6F6A61',
  textTertiary: '#A29C90',
  danger: '#D0483A',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };

export const font = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semiBold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extraBold: 'PlusJakartaSans_800ExtraBold',
};

export const shadow = {
  card: {
    shadowColor: '#1B1912',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  floating: {
    shadowColor: '#1B1912',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
};
