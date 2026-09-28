import { type ReactNode } from 'react';
import { useAuth } from '../features/auth/auth-context';
import { EmptyState } from '../components/ui/EmptyState';

export function RequirePermission({ permission, children }: { permission: string; children: ReactNode }) {
  const { hasPermission } = useAuth();
  if (!hasPermission(permission)) {
    return <EmptyState title="Sem permissão" description="Você não tem acesso a este módulo. Fale com um administrador." />;
  }
  return <>{children}</>;
}
