import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { useRealtimeEvent } from '../../lib/socket';
import { downloadCsv } from '../../lib/csv';
import { fetchAll, fetchPage, PAGE_SIZE, Paged, usePage } from '../../lib/paged';
import { paymentWarning } from '../../lib/payment';
import { Pagination } from '../../components/ui/Pagination';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { ReasonModal } from '../../components/ReasonModal';
import { useAuth } from '../../features/auth/auth-context';
import { RideFormModal } from './RideFormModal';
import { CANCELLABLE_STATUSES, NEXT_STATUS, PAYMENT_METHOD_LABEL, RideDetail, RideMessageRow, RideRow, STATUS_LABEL, STATUS_TONE } from './types';

const SENDER_LABEL: Record<'customer' | 'driver', string> = { customer: 'Cliente', driver: 'Motorista' };

export function CorridasPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState({ status: '' });
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [redispatchError, setRedispatchError] = useState<string | null>(null);

  const [page, setPage] = usePage(filters);
  const listQuery = useQuery<Paged<RideRow>>({
    queryKey: ['rides', filters, page],
    queryFn: () => fetchPage('/rides', { status: filters.status || undefined }, page),
    placeholderData: keepPreviousData,
  });

  const detailQuery = useQuery<RideDetail>({
    queryKey: ['rides', selectedId],
    queryFn: () => api.get(`/rides/${selectedId}`).then((r) => r.data),
    enabled: !!selectedId,
  });

  const driversQuery = useQuery({
    queryKey: ['drivers', { status: 'APPROVED' }, 'select'],
    queryFn: () => api.get('/drivers', { params: { status: 'APPROVED', pageSize: 1000 } }).then((r) => r.data),
    enabled: !!selectedId,
  });

  const messagesQuery = useQuery<RideMessageRow[]>({
    queryKey: ['rides', selectedId, 'messages'],
    queryFn: () => api.get(`/rides/${selectedId}/messages`).then((r) => r.data),
    enabled: !!selectedId,
  });

  const blockedDriverIdsQuery = useQuery<string[]>({
    queryKey: ['rides', selectedId, 'blocked-driver-ids'],
    queryFn: () => api.get(`/rides/${selectedId}/blocked-driver-ids`).then((r) => r.data),
    enabled: !!selectedId,
  });

  useRealtimeEvent('ride.updated', () => {
    queryClient.invalidateQueries({ queryKey: ['rides'] });
  });

  const advanceMutation = useMutation({
    mutationFn: (status: string) => api.post(`/rides/${selectedId}/advance`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rides'] }),
  });

  const assignMutation = useMutation({
    mutationFn: (driverId: string) => api.post(`/rides/${selectedId}/assign-driver`, { driverId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rides'] }),
  });

  const redispatchMutation = useMutation({
    mutationFn: () => api.post(`/rides/${selectedId}/redispatch`),
    onSuccess: () => {
      setRedispatchError(null);
      queryClient.invalidateQueries({ queryKey: ['rides'] });
    },
    onError: (error: any) => setRedispatchError(error?.response?.data?.message ?? 'Não foi possível redespachar esta corrida.'),
  });

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => api.post(`/rides/${selectedId}/cancel`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rides'] });
      setCancelOpen(false);
    },
  });

  const rides = listQuery.data?.items ?? [];
  const [exporting, setExporting] = useState(false);
  const canEdit = hasPermission('corridas.editar');
  const canCancel = hasPermission('corridas.cancelar');

  // Exporta todas as corridas do filtro (não só a página que está na tela).
  async function handleExport() {
    setExporting(true);
    try {
      const all = await fetchAll<RideRow>('/rides', { status: filters.status || undefined });
      exportRides(all);
    } finally {
      setExporting(false);
    }
  }

  function exportRides(rides: RideRow[]) {
    downloadCsv(`corridas-${new Date().toISOString().slice(0, 10)}.csv`, rides, [
      { header: 'Cliente', value: (r) => r.customer.name },
      { header: 'Motorista', value: (r) => r.driver?.name ?? '' },
      { header: 'Origem', value: (r) => r.originAddress },
      { header: 'Destino', value: (r) => r.destinationAddress },
      { header: 'Status', value: (r) => STATUS_LABEL[r.status] },
      { header: 'Preço', value: (r) => (r.finalPrice ? formatCurrency(r.finalPrice) : '') },
      { header: 'Pagamento', value: (r) => (r.paymentMethod ? PAYMENT_METHOD_LABEL[r.paymentMethod] : '') },
      { header: 'Cupom', value: (r) => r.couponCode ?? '' },
      { header: 'Solicitada em', value: (r) => new Date(r.requestedAt).toLocaleString('pt-BR') },
    ]);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Corridas</h1>
          <p className="text-sm text-muted">Acompanhamento em tempo real de todas as corridas da operação.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleExport} disabled={rides.length === 0 || exporting}>
            <Download size={16} /> {exporting ? 'Exportando…' : 'Exportar CSV'}
          </Button>
          {canEdit && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={16} /> Nova corrida
            </Button>
          )}
        </div>
      </div>

      <Card className="mb-4">
        <div className="flex flex-wrap gap-3 p-4">
          <Select value={filters.status} onChange={(e) => setFilters({ status: e.target.value })} className="w-56">
            <option value="">Todos os status</option>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <Card>
        {listQuery.isLoading ? (
          <div className="space-y-2 p-5">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rides.length === 0 ? (
          <EmptyState title="Nenhuma corrida encontrada" description="Ajuste os filtros ou registre a primeira corrida." />
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th className="px-5 py-3 font-medium">Cliente</th>
                <th className="px-5 py-3 font-medium">Motorista</th>
                <th className="px-5 py-3 font-medium">Origem → Destino</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Preço</th>
                <th className="px-5 py-3 font-medium">Solicitada em</th>
              </tr>
            </thead>
            <tbody>
              {rides.map((ride) => (
                <tr
                  key={ride.id}
                  onClick={() => {
                    setSelectedId(ride.id);
                    setRedispatchError(null);
                  }}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-hover"
                >
                  <td className="px-5 py-3 font-medium">{ride.customer.name}</td>
                  <td className="px-5 py-3 text-muted">{ride.driver?.name ?? '—'}</td>
                  <td className="px-5 py-3 text-muted">
                    {ride.originAddress} → {ride.destinationAddress}
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={STATUS_TONE[ride.status]}>{STATUS_LABEL[ride.status]}</Badge>
                  </td>
                  <td className="px-5 py-3 text-muted">{ride.finalPrice ? formatCurrency(ride.finalPrice) : '—'}</td>
                  <td className="px-5 py-3 text-muted">{new Date(ride.requestedAt).toLocaleString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={page} total={listQuery.data?.total ?? 0} pageSize={PAGE_SIZE} onChange={setPage} />
      </Card>

      <RideFormModal open={createOpen} onClose={() => setCreateOpen(false)} />

      {/* Detalhe da corrida */}
      <Modal open={!!selectedId} onClose={() => setSelectedId(null)} title="Corrida" size="lg">
        {detailQuery.isLoading || !detailQuery.data ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <Badge tone={STATUS_TONE[detailQuery.data.status]}>{STATUS_LABEL[detailQuery.data.status]}</Badge>
              <div className="flex flex-wrap gap-2">
                {canEdit && !detailQuery.data.driver && ['REQUESTED', 'SEARCHING_DRIVER'].includes(detailQuery.data.status) && (
                  <Select
                    className="text-xs"
                    defaultValue=""
                    onChange={(e) => {
                      const driverId = e.target.value;
                      if (!driverId) return;
                      // Forma de pagamento que o motorista não recebe (cartão sem máquina, Pix sem chave):
                      // também só avisa — o operador pode ter combinado outra coisa por telefone.
                      const chosen = (driversQuery.data ?? []).find((d: any) => d.id === driverId);
                      const cannotReceive = chosen ? paymentWarning(detailQuery.data?.paymentMethod, chosen) : null;
                      if (cannotReceive && !window.confirm(`Este motorista está ${cannotReceive}, e a corrida é paga em ${PAYMENT_METHOD_LABEL[detailQuery.data!.paymentMethod!]}. Atribuir mesmo assim?`)) {
                        e.target.value = '';
                        return;
                      }
                      const blocked = (blockedDriverIdsQuery.data ?? []).includes(driverId);
                      // Bloqueio (dos dois lados) não impede atribuição manual, só avisa —
                      // o operador pode ter um motivo (ex.: só esse motorista disponível
                      // na região). O despacho automático continua respeitando o bloqueio.
                      if (blocked && !window.confirm('Este motorista e este cliente se bloquearam mutuamente. Atribuir mesmo assim?')) {
                        e.target.value = '';
                        return;
                      }
                      assignMutation.mutate(driverId);
                    }}
                  >
                    <option value="" disabled>Atribuir motorista…</option>
                    {(driversQuery.data ?? []).map((d: any) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                        {(blockedDriverIdsQuery.data ?? []).includes(d.id) ? ' ⚠ bloqueado com este cliente' : ''}
                        {paymentWarning(detailQuery.data.paymentMethod, d) ? ` ⚠ ${paymentWarning(detailQuery.data.paymentMethod, d)}` : ''}
                      </option>
                    ))}
                  </Select>
                )}
                {canEdit && detailQuery.data.status === 'DRIVER_ASSIGNED' && (
                  <Button variant="secondary" onClick={() => redispatchMutation.mutate()} disabled={redispatchMutation.isPending}>
                    {redispatchMutation.isPending ? 'Buscando…' : 'Motorista não respondeu'}
                  </Button>
                )}
                {canEdit && NEXT_STATUS[detailQuery.data.status] && (
                  <Button onClick={() => advanceMutation.mutate(NEXT_STATUS[detailQuery.data!.status]!)} disabled={advanceMutation.isPending}>
                    Avançar: {STATUS_LABEL[NEXT_STATUS[detailQuery.data.status]!]}
                  </Button>
                )}
                {canCancel && CANCELLABLE_STATUSES.includes(detailQuery.data.status) && (
                  <Button variant="danger" onClick={() => setCancelOpen(true)}>
                    Cancelar
                  </Button>
                )}
              </div>
            </div>

            {redispatchError && <p className="mb-4 text-sm text-danger">{redispatchError}</p>}

            <dl className="mb-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-muted">Cliente</dt>
                <dd className="font-medium">{detailQuery.data.customer.name}</dd>
              </div>
              <div>
                <dt className="text-muted">Motorista</dt>
                <dd className="font-medium">{detailQuery.data.driver?.name ?? 'Não atribuído'}</dd>
              </div>
              <div>
                <dt className="text-muted">Origem</dt>
                <dd className="font-medium">{detailQuery.data.originAddress}</dd>
              </div>
              <div>
                <dt className="text-muted">Destino</dt>
                <dd className="font-medium">{detailQuery.data.destinationAddress}</dd>
              </div>
              <div>
                <dt className="text-muted">Preço</dt>
                <dd className="font-medium">{detailQuery.data.finalPrice ? formatCurrency(detailQuery.data.finalPrice) : 'Sem tarifa configurada'}</dd>
              </div>
              <div>
                <dt className="text-muted">Pagamento</dt>
                <dd className="font-medium">{detailQuery.data.paymentMethod ? PAYMENT_METHOD_LABEL[detailQuery.data.paymentMethod] : 'Não informado'}</dd>
              </div>
              {detailQuery.data.couponCode && (
                <div>
                  <dt className="text-muted">Cupom</dt>
                  <dd className="font-medium">
                    {detailQuery.data.couponCode}
                    {detailQuery.data.discountApplied ? ` · −${formatCurrency(detailQuery.data.discountApplied)}` : ''}
                  </dd>
                </div>
              )}
              {detailQuery.data.scheduledAt && (
                <div>
                  <dt className="text-muted">Agendada para</dt>
                  <dd className="font-medium">{new Date(detailQuery.data.scheduledAt).toLocaleString('pt-BR')}</dd>
                </div>
              )}
              {detailQuery.data.cancelReason && (
                <div className="col-span-2">
                  <dt className="text-muted">Motivo do cancelamento</dt>
                  <dd className="font-medium text-danger">{detailQuery.data.cancelReason}</dd>
                </div>
              )}
            </dl>

            <p className="mb-2 text-sm font-medium">Histórico</p>
            <ul className="flex flex-col gap-2">
              {detailQuery.data.events.map((event) => (
                <li key={event.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <span>
                    {event.metadata?.timedOut ? 'Motorista não respondeu a tempo' : event.metadata?.declined ? 'Motorista recusou' : STATUS_LABEL[event.status]}
                    {!!event.metadata?.auto && (
                      <span className="ml-2 text-xs text-muted">
                        via despacho automático{typeof event.metadata.distanceKm === 'number' ? ` · ${event.metadata.distanceKm} km` : ''}
                      </span>
                    )}
                    {typeof event.metadata?.reason === 'string' && !event.metadata?.timedOut && <span className="ml-2 text-xs text-muted">· {event.metadata.reason}</span>}
                  </span>
                  <span className="text-xs text-muted">{new Date(event.createdAt).toLocaleString('pt-BR')}</span>
                </li>
              ))}
            </ul>

            {!!messagesQuery.data?.length && (
              <>
                <p className="mb-2 mt-4 text-sm font-medium">Mensagens entre motorista e cliente</p>
                <ul className="flex flex-col gap-2">
                  {messagesQuery.data.map((message) => (
                    <li key={message.id} className="rounded-lg border border-border px-3 py-2 text-sm">
                      <div className="mb-1 flex items-center justify-between text-xs text-muted">
                        <span className="font-medium">{SENDER_LABEL[message.senderType]}</span>
                        <span>{new Date(message.createdAt).toLocaleString('pt-BR')}</span>
                      </div>
                      {message.message}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </Modal>

      <ReasonModal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancelar corrida"
        label="Motivo do cancelamento"
        confirmLabel="Confirmar cancelamento"
        loading={cancelMutation.isPending}
        onConfirm={(reason) => cancelMutation.mutate(reason)}
      />
    </div>
  );
}

function formatCurrency(value: string) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
