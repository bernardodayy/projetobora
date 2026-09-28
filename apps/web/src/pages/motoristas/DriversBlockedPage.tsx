import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../features/auth/auth-context';
import { DriverDetail, formatCpf } from './types';

export function DriversBlockedPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();

  const listQuery = useQuery<DriverDetail[]>({
    queryKey: ['drivers', { status: 'BLOCKED' }],
    queryFn: () => api.get('/drivers', { params: { status: 'BLOCKED' } }).then((r) => r.data),
  });

  const unblockMutation = useMutation({
    mutationFn: (id: string) => api.post(`/drivers/${id}/unblock`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['drivers'] }),
  });

  const drivers = listQuery.data ?? [];
  const canUnblock = hasPermission('motoristas.bloquear');

  if (listQuery.isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (drivers.length === 0) {
    return <EmptyState title="Nenhum motorista bloqueado" description="Motoristas bloqueados por um administrador aparecem aqui." />;
  }

  return (
    <Card>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted">
            <th className="px-5 py-3 font-medium">Motorista</th>
            <th className="px-5 py-3 font-medium">Motivo</th>
            <th className="px-5 py-3 font-medium">Responsável</th>
            <th className="px-5 py-3 font-medium">Data</th>
            <th className="px-5 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {drivers.map((driver) => {
            const lastBlock = driver.blocks[0];
            return (
              <tr key={driver.id} className="border-b border-border last:border-0 hover:bg-surface-hover">
                <td className="px-5 py-3">
                  <p className="font-medium">{driver.name}</p>
                  <p className="text-xs text-muted">{formatCpf(driver.cpf)}</p>
                </td>
                <td className="px-5 py-3 text-muted">{lastBlock?.reason ?? '—'}</td>
                <td className="px-5 py-3 text-muted">{lastBlock?.blockedBy?.name ?? '—'}</td>
                <td className="px-5 py-3 text-muted">{lastBlock ? new Date(lastBlock.blockedAt).toLocaleString('pt-BR') : '—'}</td>
                <td className="px-5 py-3 text-right">
                  {canUnblock && (
                    <Button variant="secondary" onClick={() => unblockMutation.mutate(driver.id)} disabled={unblockMutation.isPending}>
                      Desbloquear
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
