import { NavLink, Outlet } from 'react-router-dom';

export function ConfiguracoesLayout() {
  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink'
    }`;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Configurações</h1>
        <p className="text-sm text-muted">Dados da empresa, parâmetros de despacho, notificações e integrações.</p>
      </div>

      <div className="mb-6 flex gap-1 border-b border-border">
        <NavLink to="/configuracoes" end className={tabClass}>
          Sistema
        </NavLink>
        <NavLink to="/configuracoes/despacho" className={tabClass}>
          Despacho
        </NavLink>
        <NavLink to="/configuracoes/notificacoes" className={tabClass}>
          Notificações
        </NavLink>
        <NavLink to="/configuracoes/integracoes" className={tabClass}>
          Integrações
        </NavLink>
      </div>

      <Outlet />
    </div>
  );
}
