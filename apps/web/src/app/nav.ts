import {
  Car,
  DollarSign,
  Landmark,
  LayoutDashboard,
  Map,
  MapPinned,
  Palette,
  Route,
  ScrollText,
  Settings,
  ShieldCheck,
  Ticket,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  permission: string;
  available: boolean;
  phase?: number;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard, permission: 'dashboard.visualizar', available: true },
  { label: 'Clientes', path: '/clientes', icon: Users, permission: 'clientes.visualizar', available: true },
  { label: 'Motoristas', path: '/motoristas', icon: Car, permission: 'motoristas.visualizar', available: true },
  { label: 'Corridas', path: '/corridas', icon: Route, permission: 'corridas.visualizar', available: true },
  { label: 'Mapa operacional', path: '/mapa', icon: Map, permission: 'mapa.visualizar', available: true },
  { label: 'Planejamento', path: '/planejamento', icon: MapPinned, permission: 'corridas.visualizar', available: true },
  { label: 'Tarifas', path: '/tarifas', icon: DollarSign, permission: 'tarifas.visualizar', available: true },
  { label: 'Áreas de preço', path: '/zonas', icon: MapPinned, permission: 'zonas.visualizar', available: true },
  { label: 'Cupons', path: '/cupons', icon: Ticket, permission: 'cupons.visualizar', available: true },
  { label: 'Financeiro', path: '/financeiro', icon: Landmark, permission: 'financeiro.visualizar', available: true },
  { label: 'Usuários', path: '/usuarios', icon: ShieldCheck, permission: 'usuarios.visualizar', available: true },
  { label: 'Cargos e permissões', path: '/cargos', icon: ScrollText, permission: 'usuarios.visualizar', available: true },
  { label: 'Auditoria', path: '/auditoria', icon: ScrollText, permission: 'auditoria.visualizar', available: true },
  { label: 'Configurações', path: '/configuracoes', icon: Settings, permission: 'configuracoes.visualizar', available: true },
  { label: 'Marca dos apps', path: '/desenvolvedor/marca', icon: Palette, permission: 'desenvolvedor.marca', available: true },
];
