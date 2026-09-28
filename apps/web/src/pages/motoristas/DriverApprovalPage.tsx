import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../features/auth/auth-context';
import { api } from '../../lib/api';
import { Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { ReasonModal } from '../../components/ReasonModal';
import { DriverRow, formatCpf } from './types';

export function DriverApprovalPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [correctionId, setCorrectionId] = useState<string | null>(null);

  const listQuery = useQuery<DriverRow[]>({
    queryKey: ['drivers', { status: 'PENDING' }],
    queryFn: () => api.get('/drivers', { params: { status: 'PENDING' } }).then((r) => r.data),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['drivers'] });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.post(`/drivers/${id}/approve`),
    onSuccess: invalidate,
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.post(`/drivers/${id}/reject`, { reason }),
    onSuccess: () => {
      invalidate();
      setRejectId(null);
    },
  });

  const correctionMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.post(`/drivers/${id}/request-correction`, { reason }),
    onSuccess: () => {
      invalidate();
      setCorrectionId(null);
    },
  });

  const canApprove = hasPermission('motoristas.aprovar');
  const drivers = listQuery.data ?? [];

  if (listQuery.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[...Array(2)].map((_, i) => (
          <Skeleton key={i} className="h-48" />
        ))}
      </div>
    );
  }

  if (drivers.length === 0) {
    return <EmptyState title="Nenhum motorista aguardando aprovação" description="Novos cadastros aparecem aqui para revisão." />;
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {drivers.map((driver) => (
          <Card key={driver.id}>
            <CardBody>
              <p className="font-medium">{driver.name}</p>
              <p className="text-xs text-muted">Solicitado em {new Date(driver.createdAt).toLocaleDateString('pt-BR')}</p>

              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-xs text-muted">CPF</dt>
                  <dd>{formatCpf(driver.cpf)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Telefone</dt>
                  <dd>{driver.phone}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">CNH</dt>
                  <dd>
                    {driver.cnh} · {driver.cnhCategory}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Veículo</dt>
                  <dd>{driver.vehicles[0] ? `${driver.vehicles[0].plate} · ${driver.vehicles[0].model}` : '—'}</dd>
                </div>
              </dl>

              {canApprove && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button onClick={() => approveMutation.mutate(driver.id)} disabled={approveMutation.isPending}>
                    Aprovar
                  </Button>
                  <Button variant="secondary" onClick={() => setCorrectionId(driver.id)}>
                    Solicitar correção
                  </Button>
                  <Button variant="danger" onClick={() => setRejectId(driver.id)}>
                    Reprovar
                  </Button>
                </div>
              )}
            </CardBody>
          </Card>
        ))}
      </div>

      <ReasonModal
        open={!!rejectId}
        onClose={() => setRejectId(null)}
        title="Reprovar motorista"
        label="Motivo da reprovação"
        confirmLabel="Confirmar reprovação"
        loading={rejectMutation.isPending}
        onConfirm={(reason) => rejectId && rejectMutation.mutate({ id: rejectId, reason })}
      />

      <ReasonModal
        open={!!correctionId}
        onClose={() => setCorrectionId(null)}
        title="Solicitar correção"
        label="O que o motorista precisa corrigir?"
        confirmLabel="Enviar solicitação"
        loading={correctionMutation.isPending}
        onConfirm={(reason) => correctionId && correctionMutation.mutate({ id: correctionId, reason })}
      />
    </div>
  );
}
