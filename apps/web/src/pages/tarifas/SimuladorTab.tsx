import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Calculator } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card, CardBody } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { SimulationResult, STRATEGY_LABEL } from './types';

const EMPTY_FORM = { originLat: '', originLng: '', destinationLat: '', destinationLng: '', at: '' };

export function SimuladorTab() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const simulateMutation = useMutation<SimulationResult>({
    mutationFn: () =>
      api
        .post('/pricing/simulate', {
          originLat: Number(form.originLat),
          originLng: Number(form.originLng),
          destinationLat: Number(form.destinationLat),
          destinationLng: Number(form.destinationLng),
          at: form.at ? new Date(form.at).toISOString() : undefined,
        })
        .then((r) => r.data),
    onError: (err: any) => setError(err?.response?.data?.message ?? 'Não foi possível simular a tarifa.'),
  });

  const result = simulateMutation.data;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
      <Card>
        <CardBody>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              simulateMutation.mutate();
            }}
          >
            <p className="text-sm font-medium">Origem</p>
            <div className="grid grid-cols-2 gap-2">
              <Input label="Latitude" type="number" step="any" required value={form.originLat} onChange={(e) => setForm({ ...form, originLat: e.target.value })} />
              <Input label="Longitude" type="number" step="any" required value={form.originLng} onChange={(e) => setForm({ ...form, originLng: e.target.value })} />
            </div>

            <p className="text-sm font-medium">Destino</p>
            <div className="grid grid-cols-2 gap-2">
              <Input label="Latitude" type="number" step="any" required value={form.destinationLat} onChange={(e) => setForm({ ...form, destinationLat: e.target.value })} />
              <Input label="Longitude" type="number" step="any" required value={form.destinationLng} onChange={(e) => setForm({ ...form, destinationLng: e.target.value })} />
            </div>

            <Input label="Data e horário (opcional, padrão agora)" type="datetime-local" value={form.at} onChange={(e) => setForm({ ...form, at: e.target.value })} />

            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" disabled={simulateMutation.isPending}>
              <Calculator size={16} /> {simulateMutation.isPending ? 'Calculando…' : 'Calcular tarifa'}
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          {!result ? (
            <EmptyState title="Preencha origem e destino" description="O detalhamento completo do cálculo aparece aqui." />
          ) : (
            <div>
              <p className="mb-4 text-sm font-medium">Detalhamento do cálculo</p>
              <dl className="flex flex-col gap-2 text-sm">
                <Row label="Tarifa base" value={formatCurrency(result.baseFare)} />
                <Row label="Distância" value={`${result.distanceKm} km${result.distanceSource === 'estimated' ? ' (estimada)' : ''}`} />
                <Row label="Valor distância" value={formatCurrency(result.distanceFare)} />
                <Row label="Tempo estimado" value={`${result.durationMin} min`} />
                <Row label="Valor tempo" value={formatCurrency(result.timeFare)} />
                <Row label="Zona aplicada" value={result.zone ? formatZone(result.zone) : 'Nenhuma'} />
                <Row label="Horário aplicado" value={result.schedule ? `${result.schedule.name} (${result.schedule.multiplier}×)` : 'Nenhum'} />
                <Row label="Estratégia" value={STRATEGY_LABEL[result.combinationStrategy]} />
                <Row label="Multiplicador aplicado" value={`${result.appliedMultiplier}×`} />
                <Row label="Tarifa mínima" value={formatCurrency(result.minimumFare)} />
              </dl>
              <div className="mt-4 flex items-center justify-between rounded-lg bg-brand/10 px-4 py-3">
                <span className="text-sm font-medium text-brand">Preço final</span>
                <span className="text-xl font-semibold text-brand">{formatCurrency(result.finalPrice)}</span>
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-2">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatZone(zone: NonNullable<SimulationResult['zone']>) {
  if (zone.fixedPrice) return `${zone.name} (${formatCurrency(zone.fixedPrice)} fixo)`;
  if (zone.multiplier) return `${zone.name} (${zone.multiplier}×)`;
  return zone.name;
}
