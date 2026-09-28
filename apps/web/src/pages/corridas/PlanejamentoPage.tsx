import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { useRealtimeEvent } from '../../lib/socket';
import { Button } from '../../components/ui/Button';
import { Card, CardBody } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../features/auth/auth-context';
import { RideFormModal } from './RideFormModal';
import { RideRow, STATUS_LABEL, STATUS_TONE } from './types';

export function PlanejamentoPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const scheduledQuery = useQuery<RideRow[]>({
    queryKey: ['rides', 'scheduled'],
    queryFn: () => api.get('/rides/scheduled').then((r) => r.data),
  });

  useRealtimeEvent('ride.updated', () => {
    queryClient.invalidateQueries({ queryKey: ['rides'] });
  });

  const rides = scheduledQuery.data ?? [];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Planejamento</h1>
          <p className="text-sm text-muted">Corridas agendadas para os próximos dias, em ordem de horário.</p>
        </div>
        {hasPermission('corridas.editar') && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} /> Nova corrida agendada
          </Button>
        )}
      </div>

      {scheduledQuery.isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : rides.length === 0 ? (
        <Card>
          <EmptyState title="Nenhuma corrida agendada" description="Corridas com data/hora futura marcada aparecem aqui." />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {rides.map((ride) => (
            <Card key={ride.id}>
              <CardBody className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{ride.customer.name}</p>
                  <p className="text-xs text-muted">
                    {ride.originAddress} → {ride.destinationAddress}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm font-medium">{ride.scheduledAt ? new Date(ride.scheduledAt).toLocaleString('pt-BR') : '—'}</p>
                    <p className="text-xs text-muted">{ride.driver?.name ?? 'Sem motorista atribuído'}</p>
                  </div>
                  <Badge tone={STATUS_TONE[ride.status]}>{STATUS_LABEL[ride.status]}</Badge>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <RideFormModal open={createOpen} onClose={() => setCreateOpen(false)} defaultScheduled />
    </div>
  );
}
