import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, CircleDollarSign, Download, Landmark, Wallet, XCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { downloadCsv } from '../../lib/csv';
import { fetchAll, fetchPage, PAGE_SIZE, Paged, usePage } from '../../lib/paged';
import { Pagination } from '../../components/ui/Pagination';
import { Card, CardBody } from '../../components/ui/Card';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { SimpleBarChart } from '../../components/ui/SimpleBarChart';
import { useAuth } from '../../features/auth/auth-context';
import { DailyRevenuePoint, FinancialSummary, FinancialTransactionRow, STATUS_LABEL, TYPE_LABEL } from './types';

type Preset = 'today' | '7d' | '30d' | 'custom';

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function presetRange(preset: Preset): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  if (preset === 'today') {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { from: from.toISOString(), to };
  }
  if (preset === '7d') {
    const from = new Date(now.getTime() - 7 * 86_400_000);
    return { from: from.toISOString(), to };
  }
  const from = new Date(now.getTime() - 30 * 86_400_000);
  return { from: from.toISOString(), to };
}

function StatCard({ label, value, icon: Icon, loading }: { label: string; value: string; icon: React.ElementType; loading?: boolean }) {
  return (
    <Card>
      <CardBody className="flex items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <Icon size={18} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted">{label}</p>
          {loading ? <Skeleton className="mt-1 h-6 w-20" /> : <p className="text-xl font-semibold">{value}</p>}
        </div>
      </CardBody>
    </Card>
  );
}

export function FinanceiroPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canSettle = hasPermission('financeiro.editar');
  const canEditCommission = hasPermission('configuracoes.editar');

  const [preset, setPreset] = useState<Preset>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [driverId, setDriverId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [commissionDraft, setCommissionDraft] = useState('');
  const [commissionError, setCommissionError] = useState<string | null>(null);

  // Memoizado: presetRange() usa `new Date()` a cada chamada, então sem isso o
  // objeto mudaria a cada render e o React Query entraria em loop de refetch.
  const range = useMemo(() => (preset === 'custom' ? { from: customFrom, to: customTo } : presetRange(preset)), [preset, customFrom, customTo]);
  const filters = useMemo(
    () => ({ from: range.from || undefined, to: range.to || undefined, driverId: driverId || undefined, customerId: customerId || undefined, paymentMethod: paymentMethod || undefined }),
    [range, driverId, customerId, paymentMethod],
  );

  const summaryQuery = useQuery<FinancialSummary>({ queryKey: ['financeiro-summary', filters], queryFn: () => api.get('/financeiro/summary', { params: filters }).then((r) => r.data) });
  const dailyQuery = useQuery<DailyRevenuePoint[]>({ queryKey: ['financeiro-daily', range], queryFn: () => api.get('/financeiro/daily', { params: range }).then((r) => r.data) });
  const [page, setPage] = usePage(filters);
  const transactionsQuery = useQuery<Paged<FinancialTransactionRow>>({
    queryKey: ['financeiro-transactions', filters, page],
    queryFn: () => fetchPage('/financeiro/transactions', filters, page),
    placeholderData: keepPreviousData,
  });
  const commissionQuery = useQuery<{ percent: number }>({ queryKey: ['financeiro-commission'], queryFn: () => api.get('/financeiro/commission').then((r) => r.data) });
  const driversQuery = useQuery({ queryKey: ['drivers', { status: 'APPROVED' }, 'select'], queryFn: () => api.get('/drivers', { params: { status: 'APPROVED', pageSize: 1000 } }).then((r) => r.data) });
  const customersQuery = useQuery({ queryKey: ['customers', 'select'], queryFn: () => api.get('/customers', { params: { pageSize: 1000 } }).then((r) => r.data) });

  const settleMutation = useMutation({
    mutationFn: (id: string) => api.post(`/financeiro/transactions/${id}/settle`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['financeiro-summary'] });
    },
  });

  const commissionMutation = useMutation({
    mutationFn: (percent: number) => api.patch('/financeiro/commission', { percent }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro-commission'] });
      setCommissionDraft('');
    },
    onError: (err: any) => setCommissionError(err?.response?.data?.message ?? 'Não foi possível salvar.'),
  });

  const chartData = useMemo(
    () => (dailyQuery.data ?? []).map((point) => ({ label: point.date.slice(5), value: point.amount })),
    [dailyQuery.data],
  );

  const summary = summaryQuery.data;
  const transactions = transactionsQuery.data?.items ?? [];
  const [exporting, setExporting] = useState(false);

  // Exporta todas as transações do filtro (não só a página que está na tela).
  async function handleExport() {
    setExporting(true);
    try {
      exportTransactions(await fetchAll<FinancialTransactionRow>('/financeiro/transactions', filters));
    } finally {
      setExporting(false);
    }
  }

  function exportTransactions(transactions: FinancialTransactionRow[]) {
    downloadCsv(`financeiro-${new Date().toISOString().slice(0, 10)}.csv`, transactions, [
      { header: 'Tipo', value: (tx) => TYPE_LABEL[tx.type] },
      { header: 'Cliente', value: (tx) => tx.ride?.customer.name ?? '' },
      { header: 'Motorista', value: (tx) => tx.ride?.driver?.name ?? '' },
      { header: 'Valor', value: (tx) => formatCurrency(Number(tx.amount)) },
      { header: 'Status', value: (tx) => STATUS_LABEL[tx.status] },
      { header: 'Data', value: (tx) => new Date(tx.createdAt).toLocaleDateString('pt-BR') },
    ]);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Financeiro</h1>
          <p className="text-sm text-muted">Faturamento, repasses a motoristas e taxas da plataforma.</p>
        </div>
        <Button variant="secondary" onClick={handleExport} disabled={transactions.length === 0 || exporting}>
          <Download size={16} /> {exporting ? 'Exportando…' : 'Exportar CSV'}
        </Button>
      </div>

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3 p-4">
          <Select label="Período" value={preset} onChange={(e) => setPreset(e.target.value as Preset)} className="w-40">
            <option value="today">Hoje</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="custom">Personalizado</option>
          </Select>
          {preset === 'custom' && (
            <>
              <Input label="De" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              <Input label="Até" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </>
          )}
          <Select label="Motorista" value={driverId} onChange={(e) => setDriverId(e.target.value)} className="w-48">
            <option value="">Todos os motoristas</option>
            {(driversQuery.data ?? []).map((d: any) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
          <Select label="Cliente" value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-48">
            <option value="">Todos os clientes</option>
            {(customersQuery.data ?? []).map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <Select label="Forma de pagamento" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-44">
            <option value="">Todas</option>
            <option value="CASH">Dinheiro</option>
            <option value="CREDIT_CARD">Cartão de crédito</option>
            <option value="DEBIT_CARD">Cartão de débito</option>
            <option value="PIX">Pix</option>
            <option value="WALLET">Carteira</option>
          </Select>
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Faturamento" value={summary ? formatCurrency(summary.revenue) : '—'} icon={CircleDollarSign} loading={summaryQuery.isLoading} />
        <StatCard label="Taxas da plataforma" value={summary ? formatCurrency(summary.platformFees) : '—'} icon={Landmark} loading={summaryQuery.isLoading} />
        <StatCard label="Repasses pendentes" value={summary ? formatCurrency(summary.payoutsPending) : '—'} icon={Wallet} loading={summaryQuery.isLoading} />
        <StatCard label="Repasses pagos" value={summary ? formatCurrency(summary.payoutsPaid) : '—'} icon={Banknote} loading={summaryQuery.isLoading} />
        <StatCard label="Corridas canceladas" value={summary ? String(summary.cancelledRides) : '—'} icon={XCircle} loading={summaryQuery.isLoading} />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardBody>
            <p className="mb-3 text-sm font-medium">Faturamento por dia</p>
            {dailyQuery.isLoading ? <Skeleton className="h-56 w-full" /> : <SimpleBarChart data={chartData} formatValue={formatCurrency} />}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="mb-1 text-sm font-medium">Comissão da plataforma</p>
            <p className="mb-3 text-xs text-muted">Percentual retido em cada corrida finalizada; o restante é o repasse ao motorista.</p>
            {commissionQuery.isLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : canEditCommission ? (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setCommissionError(null);
                  commissionMutation.mutate(Number(commissionDraft || commissionQuery.data?.percent));
                }}
              >
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  className="w-24"
                  value={commissionDraft || String(commissionQuery.data?.percent ?? '')}
                  onChange={(e) => setCommissionDraft(e.target.value)}
                />
                <Button type="submit" variant="secondary" disabled={commissionMutation.isPending}>
                  {commissionMutation.isPending ? 'Salvando…' : 'Salvar %'}
                </Button>
              </form>
            ) : (
              <p className="text-2xl font-semibold">{commissionQuery.data?.percent}%</p>
            )}
            {commissionError && <p className="mt-2 text-sm text-danger">{commissionError}</p>}
          </CardBody>
        </Card>
      </div>

      <Card>
        {transactionsQuery.isLoading ? (
          <div className="space-y-2 p-5">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <EmptyState title="Nenhuma transação no período" description="Corridas finalizadas geram pagamento, taxa e repasse automaticamente." />
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th className="px-5 py-3 font-medium">Tipo</th>
                <th className="px-5 py-3 font-medium">Cliente</th>
                <th className="px-5 py-3 font-medium">Motorista</th>
                <th className="px-5 py-3 font-medium">Valor</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Data</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className="border-b border-border last:border-0 hover:bg-surface-hover">
                  <td className="px-5 py-3 font-medium">{TYPE_LABEL[tx.type]}</td>
                  <td className="px-5 py-3 text-muted">{tx.ride?.customer.name ?? '—'}</td>
                  <td className="px-5 py-3 text-muted">{tx.ride?.driver?.name ?? '—'}</td>
                  <td className="px-5 py-3">{formatCurrency(Number(tx.amount))}</td>
                  <td className="px-5 py-3">
                    <Badge tone={tx.status === 'COMPLETED' ? 'success' : tx.status === 'FAILED' ? 'danger' : 'warning'}>{STATUS_LABEL[tx.status]}</Badge>
                  </td>
                  <td className="px-5 py-3 text-muted">{new Date(tx.createdAt).toLocaleDateString('pt-BR')}</td>
                  <td className="px-5 py-3 text-right">
                    {canSettle && tx.type === 'DRIVER_PAYOUT' && tx.status === 'PENDING' && (
                      <Button variant="secondary" onClick={() => settleMutation.mutate(tx.id)} disabled={settleMutation.isPending}>
                        Marcar como pago
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={page} total={transactionsQuery.data?.total ?? 0} pageSize={PAGE_SIZE} onChange={setPage} />
      </Card>
    </div>
  );
}
