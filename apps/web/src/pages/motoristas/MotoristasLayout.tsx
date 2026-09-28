import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../features/auth/auth-context';

export function MotoristasLayout() {
  const { hasPermission } = useAuth();

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink'
    }`;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Motoristas</h1>
        <p className="text-sm text-muted">Cadastro, aprovação e bloqueio de motoristas parceiros.</p>
      </div>

      <div className="mb-6 flex gap-1 border-b border-border">
        <NavLink to="/motoristas" end className={tabClass}>
          Todos
        </NavLink>
        {hasPermission('motoristas.aprovar') && (
          <NavLink to="/motoristas/aprovacao" className={tabClass}>
            Aprovação
          </NavLink>
        )}
        {hasPermission('motoristas.bloquear') && (
          <NavLink to="/motoristas/bloqueados" className={tabClass}>
            Bloqueados
          </NavLink>
        )}
      </div>

      <Outlet />
    </div>
  );
}
