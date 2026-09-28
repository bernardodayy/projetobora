import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card, CardBody } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../features/auth/auth-context';
import { CombinationStrategy, ConfigHistoryEntry, PricingConfig, STRATEGY_LABEL } from './types';

const FIELD_LABEL: Record<string, string> = {
  baseFare: 'Tarifa base',
  perKm: 'Valor por km',
  perMinute: 'Valor por minuto',
  minimumFare: 'Tarifa mínima',
  combinationStrategy: 'Estratégia de combinação',
};

export function ConfiguracaoTab() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = hasPermission('tarifas.editar');

  const [form, setForm] = useState({ baseFare: '', perKm: '', perMinute: '', minimumFare: '', combinationStrategy: 'HIGHEST_MULTIPLIER' as CombinationStrategy });
  const [error, setError] = useState<string | null>(null);

  const configQuery = useQuery<PricingConfig>({ queryKey: ['pricing-config'], queryFn: () => api.get('/pricing/config').then((r) => r.data) });
  const historyQuery = useQuery<ConfigHistoryEntry[]>({ queryKey: ['pricing-config-history'], queryFn: () => api.get('/pricing/config/history').then((r) => r.data) });

  useEffect(() => {
    if (configQuery.data) {
      setForm({
        baseFare: configQuery.data.baseFare,
        perKm: configQuery.data.perKm,
        perMinute: configQuery.data.perMinute,
        minimumFare: configQuery.data.minimumFare,
        combinationStrategy: configQuery.data.combinationStrategy,
      });
    }
  }, [configQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.patch('/pricing/config', {
        baseFare: Number(form.baseFare),
        perKm: Number(form.perKm),
        perMinute: Number(form.perMinute),
        minimumFare: Number(form.minimumFare),
        combinationStrategy: form.combinationStrategy,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pricing-config'] });
      queryClient.invalidateQueries({ queryKey: ['pricing-config-history'] });
    },
    onError: (err: any) => setError(err?.response?.data?.message ?? 'Não foi possível salvar a configuração.'),
  });

  if (configQuery.isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
      <Card>
        <CardBody>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              saveMutation.mutate();
            }}
          >
            <div className="grid grid-cols-2 gap-4">
              <Input label="Tarifa base (R$)" type="number" step="0.01" min="0" required disabled={!canEdit} value={form.baseFare} onChange={(e) => setForm({ ...form, baseFare: e.target.value })} />
              <Input label="Tarifa mínima (R$)" type="number" step="0.01" min="0" required disabled={!canEdit} value={form.minimumFare} onChange={(e) => setForm({ ...form, minimumFare: e.target.value })} />
              <Input label="Valor por km (R$)" type="number" step="0.01" min="0" required disabled={!canEdit} value={form.perKm} onChange={(e) => setForm({ ...form, perKm: e.target.value })} />
              <Input label="Valor por minuto (R$)" type="number" step="0.01" min="0" required disabled={!canEdit} value={form.perMinute} onChange={(e) => setForm({ ...form, perMinute: e.target.value })} />
            </div>

            <Select
              label="Estratégia de combinação (zona + horário)"
              disabled={!canEdit}
              value={form.combinationStrategy}
              onChange={(e) => setForm({ ...form, combinationStrategy: e.target.value as CombinationStrategy })}
            >
              {Object.entries(STRATEGY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>

            <p className="text-xs text-muted">
              PREÇO = tarifa base + (km × valor/km) + (minutos × valor/minuto), depois a estratégia acima aplica os
              multiplicadores de zona e horário. Nunca abaixo da tarifa mínima.
            </p>

            {error && <p className="text-sm text-danger">{error}</p>}
            {canEdit && (
              <Button type="submit" disabled={saveMutation.isPending} className="mt-1">
                {saveMutation.isPending ? 'Salvando…' : 'Salvar configuração'}
              </Button>
            )}
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <p className="mb-3 text-sm font-medium">Histórico de alterações</p>
          {historyQuery.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (historyQuery.data ?? []).length === 0 ? (
            <EmptyState title="Nenhuma alteração ainda" />
          ) : (
            <ul className="flex flex-col gap-3">
              {(historyQuery.data ?? []).map((entry) => (
                <li key={entry.id} className="border-b border-border pb-3 text-sm last:border-0">
                  <p className="font-medium">{FIELD_LABEL[entry.field] ?? entry.field}</p>
                  <p className="text-muted">
                    {entry.previousValue} → {entry.newValue}
                  </p>
                  <p className="text-xs text-muted">
                    {entry.changedByName ?? 'Administrador'} · {new Date(entry.changedAt).toLocaleString('pt-BR')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
