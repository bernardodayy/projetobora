import { NavLink, Outlet } from 'react-router-dom';

export function TarifasLayout() {
  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink'
    }`;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Tarifas</h1>
        <p className="text-sm text-muted">Fórmula de preço, multiplicadores por horário e simulador de corrida.</p>
      </div>

      <div className="mb-6 flex gap-1 border-b border-border">
        <NavLink to="/tarifas" end className={tabClass}>
          Configuração
        </NavLink>
        <NavLink to="/tarifas/horarios" className={tabClass}>
          Horários
        </NavLink>
        <NavLink to="/tarifas/simulador" className={tabClass}>
          Simulador
        </NavLink>
      </div>

      <Outlet />
    </div>
  );
}
