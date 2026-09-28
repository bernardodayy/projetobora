import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Car, CircleDollarSign, Route, ShieldCheck, UserCheck, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useRealtimeEvent } from '../lib/socket';
import { Card, CardBody } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { useAuth } from '../features/auth/auth-context';

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ElementType;
  loading?: boolean;
}

function StatCard({ label, value, icon: Icon, loading }: StatCardProps) {
  return (
    <Card>
      <CardBody className="flex items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <Icon size={18} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted">{label}</p>
          {loading ? <Skeleton className="mt-1 h-6 w-14" /> : <p className="text-xl font-semibold">{value}</p>}
        </div>
      </CardBody>
    </Card>
  );
}

interface DashboardSummary {
  users: number | null;
  customers: number | null;
  driversApproved: number | null;
  driversPending: number | null;
  driversOnline: number | null;
  ridesOngoing: number | null;
}

// Contagem feita no servidor (COUNT no banco): antes o painel baixava as listas (cortadas em 200) e
// contava no navegador, então os números travavam em 200. `null` = sem permissão para o módulo.
const show = (value: number | null | undefined) => (value == null ? '—' : value.toLocaleString('pt-BR'));

export function DashboardPage() {
  const { user, hasPermission } = useAuth();

  const summaryQuery = useQuery<DashboardSummary>({
    queryKey: ['dashboard-summary'],
    queryFn: () => api.get('/dashboard/summary').then((r) => r.data),
    refetchInterval: 30_000,
  });
  const counts = summaryQuery.data;

  // Corrida ou motorista mudou: os contadores acompanham sem esperar o refresh de 30 s.
  const queryClient = useQueryClient();
  const refreshCounts = () => queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
  useRealtimeEvent('ride.updated', refreshCounts);
  useRealtimeEvent('driver.updated', refreshCounts);

  // Memoizado: `new Date()` recalculado a cada render faria a queryKey mudar sempre,
  // travando o React Query em loop de refetch (mesmo bug corrigido antes em Financeiro).
  const { todayRange, monthRange } = useMemo(() => {
    const now = new Date();
    return {
      todayRange: { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(), to: now.toISOString() },
      monthRange: { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to: now.toISOString() },
    };
  }, []);

  const todaySummaryQuery = useQuery({
    queryKey: ['financeiro-summary', todayRange],
    queryFn: () => api.get('/financeiro/summary', { params: todayRange }).then((r) => r.data),
    enabled: hasPermission('financeiro.visualizar'),
  });
  const monthSummaryQuery = useQuery({
    queryKey: ['financeiro-summary', monthRange],
    queryFn: () => api.get('/financeiro/summary', { params: monthRange }).then((r) => r.data),
    enabled: hasPermission('financeiro.visualizar'),
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Olá, {user?.name.split(' ')[0]}</h1>
        <p className="text-sm text-muted">Visão geral da operação.</p>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Usuários administrativos" value={show(counts?.users)} icon={ShieldCheck} loading={summaryQuery.isLoading} />
        <StatCard label="Clientes cadastrados" value={show(counts?.customers)} icon={Users} loading={summaryQuery.isLoading} />
        <StatCard label="Motoristas aprovados" value={show(counts?.driversApproved)} icon={Car} loading={summaryQuery.isLoading} />
        <StatCard label="Motoristas aguardando aprovação" value={show(counts?.driversPending)} icon={UserCheck} loading={summaryQuery.isLoading} />
      </div>

      <div className="mb-2 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Corridas em andamento" value={show(counts?.ridesOngoing)} icon={Route} loading={summaryQuery.isLoading} />
        <StatCard label="Motoristas online agora" value={show(counts?.driversOnline)} icon={Car} loading={summaryQuery.isLoading} />
        <StatCard
          label="Faturamento do dia"
          value={todaySummaryQuery.data ? formatCurrency(todaySummaryQuery.data.revenue) : '—'}
          icon={CircleDollarSign}
          loading={todaySummaryQuery.isLoading}
        />
        <StatCard
          label="Faturamento do mês"
          value={monthSummaryQuery.data ? formatCurrency(monthSummaryQuery.data.revenue) : '—'}
          icon={CircleDollarSign}
          loading={monthSummaryQuery.isLoading}
        />
      </div>
    </div>
  );
}
