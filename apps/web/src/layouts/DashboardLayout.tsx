import { NavLink, Outlet } from 'react-router-dom';
import { LogOut, Moon, Sun } from 'lucide-react';
import { NAV_ITEMS } from '../app/nav';
import { useAuth } from '../features/auth/auth-context';
import { NotificationBell } from '../features/notifications/NotificationBell';
import { BrandMark, CENTRAL_NAME } from '../features/branding/BrandMark';
import { useTheme } from '../lib/theme-context';

export function DashboardLayout() {
  const { user, hasPermission, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const visibleItems = NAV_ITEMS.filter((item) => hasPermission(item.permission));

  return (
    <div className="flex h-screen bg-canvas text-ink">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-brand-ink"
      >
        Pular para o conteúdo
      </a>
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-surface">
        <div className="flex items-center gap-2 px-5 py-5">
          <BrandMark size={32} iconSize={16} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-none">{CENTRAL_NAME}</p>
          </div>
          <NotificationBell />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2">
          {visibleItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive ? 'bg-brand/10 font-medium text-brand' : 'text-muted hover:bg-surface-hover hover:text-ink'
                }`
              }
            >
              <item.icon size={17} strokeWidth={2} />
              <span className="flex-1">{item.label}</span>
              {!item.available && (
                <span className="rounded-full bg-surface-hover px-1.5 py-0.5 text-[10px] text-muted">
                  Fase {item.phase}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border px-3 py-3">
          <div className="mb-2 flex items-center gap-2 rounded-lg px-2 py-1.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-hover text-xs font-semibold">
              {user?.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user?.name}</p>
              <p className="truncate text-xs text-muted">{user?.role}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={toggle}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border py-1.5 text-xs text-muted hover:bg-surface-hover"
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
              {theme === 'dark' ? 'Claro' : 'Escuro'}
            </button>
            <button
              onClick={logout}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border py-1.5 text-xs text-muted hover:bg-surface-hover"
            >
              <LogOut size={14} />
              Sair
            </button>
          </div>
        </div>
      </aside>

      <main id="main-content" className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1600px] p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
