import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card, CardBody } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../features/auth/auth-context';
import { WEEKDAY_LABEL } from '../tarifas/types';
import { PricingZone, ZoneShape } from './types';

const EMPTY_POINT = { lat: '', lng: '' };

const EMPTY_FORM = {
  id: '',
  name: '',
  shape: 'CIRCLE' as ZoneShape,
  centerLat: '',
  centerLng: '',
  radiusMeters: '',
  points: [{ ...EMPTY_POINT }, { ...EMPTY_POINT }, { ...EMPTY_POINT }],
  multiplier: '',
  fixedPrice: '',
  minimumFare: '',
  perKm: '',
  perMinute: '',
  baseFare: '',
  priority: '0',
  daysOfWeek: [] as number[],
  startTime: '',
  endTime: '',
  isActive: true,
};

export function ZonasPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const listQuery = useQuery<PricingZone[]>({ queryKey: ['pricing-zones'], queryFn: () => api.get('/pricing/zones').then((r) => r.data) });

  const saveMutation = useMutation({
    mutationFn: () => {
      const geometry =
        form.shape === 'CIRCLE'
          ? { center: { lat: Number(form.centerLat), lng: Number(form.centerLng) }, radiusMeters: Number(form.radiusMeters) }
          : { points: form.points.filter((p) => p.lat && p.lng).map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) })) };

      const payload = {
        name: form.name,
        shape: form.shape,
        geometry,
        multiplier: form.multiplier ? Number(form.multiplier) : undefined,
        fixedPrice: form.fixedPrice ? Number(form.fixedPrice) : undefined,
        minimumFare: form.minimumFare ? Number(form.minimumFare) : undefined,
        perKm: form.perKm ? Number(form.perKm) : undefined,
        perMinute: form.perMinute ? Number(form.perMinute) : undefined,
        baseFare: form.baseFare ? Number(form.baseFare) : undefined,
        priority: Number(form.priority),
        daysOfWeek: form.daysOfWeek,
        startTime: form.startTime || undefined,
        endTime: form.endTime || undefined,
        isActive: form.isActive,
      };
      return form.id ? api.patch(`/pricing/zones/${form.id}`, payload) : api.post('/pricing/zones', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pricing-zones'] });
      setModalOpen(false);
    },
    onError: (err: any) => setError(err?.response?.data?.message ?? 'Não foi possível salvar a zona.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/pricing/zones/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pricing-zones'] }),
  });

  function openCreate() {
    setForm(EMPTY_FORM);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(zone: PricingZone) {
    setForm({
      id: zone.id,
      name: zone.name,
      shape: zone.shape,
      centerLat: zone.geometry.center ? String(zone.geometry.center.lat) : '',
      centerLng: zone.geometry.center ? String(zone.geometry.center.lng) : '',
      radiusMeters: zone.geometry.radiusMeters ? String(zone.geometry.radiusMeters) : '',
      points: zone.geometry.points && zone.geometry.points.length > 0 ? zone.geometry.points.map((p) => ({ lat: String(p.lat), lng: String(p.lng) })) : EMPTY_FORM.points,
      multiplier: zone.multiplier ?? '',
      fixedPrice: zone.fixedPrice ?? '',
      minimumFare: zone.minimumFare ?? '',
      perKm: zone.perKm ?? '',
      perMinute: zone.perMinute ?? '',
      baseFare: zone.baseFare ?? '',
      priority: String(zone.priority),
      daysOfWeek: zone.daysOfWeek,
      startTime: zone.startTime ?? '',
      endTime: zone.endTime ?? '',
      isActive: zone.isActive,
    });
    setError(null);
    setModalOpen(true);
  }

  function updatePoint(index: number, field: 'lat' | 'lng', value: string) {
    setForm((prev) => ({ ...prev, points: prev.points.map((p, i) => (i === index ? { ...p, [field]: value } : p)) }));
  }

  function toggleDay(day: number) {
    setForm((prev) => ({ ...prev, daysOfWeek: prev.daysOfWeek.includes(day) ? prev.daysOfWeek.filter((d) => d !== day) : [...prev.daysOfWeek, day] }));
  }

  const zones = listQuery.data ?? [];
  const canManage = hasPermission('zonas.criar') || hasPermission('zonas.editar');

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Áreas de preço</h1>
          <p className="text-sm text-muted">Zonas geográficas com regras próprias de tarifa, priorizadas entre si.</p>
        </div>
        {hasPermission('zonas.criar') && (
          <Button onClick={openCreate}>
            <Plus size={16} /> Nova zona
          </Button>
        )}
      </div>

      {listQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : zones.length === 0 ? (
        <Card>
          <EmptyState title="Nenhuma zona cadastrada" description="Crie áreas como 'Zona Aeroporto' ou 'Zona Evento' com seu próprio multiplicador." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {zones.map((zone) => (
            <Card key={zone.id}>
              <CardBody>
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <p className="font-medium">{zone.name}</p>
                    <p className="text-xs text-muted">{zone.shape === 'CIRCLE' ? 'Círculo' : 'Polígono'} · prioridade {zone.priority}</p>
                  </div>
                  <Badge tone={zone.isActive ? 'success' : 'neutral'}>{zone.isActive ? 'Ativa' : 'Inativa'}</Badge>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {zone.multiplier && <Badge tone="brand">{zone.multiplier}×</Badge>}
                  {zone.fixedPrice && <Badge tone="warning">R$ {zone.fixedPrice} fixo</Badge>}
                  {zone.daysOfWeek.length > 0 && <Badge tone="neutral">{zone.daysOfWeek.map((d) => WEEKDAY_LABEL[d]).join(', ')}</Badge>}
                  {zone.startTime && <Badge tone="neutral">{zone.startTime}–{zone.endTime}</Badge>}
                </div>

                <div className="mt-4 flex gap-2">
                  {canManage && (
                    <Button variant="secondary" onClick={() => openEdit(zone)} className="flex-1">
                      Editar
                    </Button>
                  )}
                  {hasPermission('zonas.excluir') && (
                    <button
                      onClick={() => confirm(`Excluir a zona "${zone.name}"?`) && deleteMutation.mutate(zone.id)}
                      className="rounded-lg border border-border px-3 text-muted hover:text-danger"
                      aria-label="Excluir"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={form.id ? 'Editar zona' : 'Nova zona'} size="lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            saveMutation.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <Input label="Nome" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Select label="Forma" value={form.shape} onChange={(e) => setForm({ ...form, shape: e.target.value as ZoneShape })}>
              <option value="CIRCLE">Círculo</option>
              <option value="POLYGON">Polígono</option>
            </Select>
          </div>

          {form.shape === 'CIRCLE' ? (
            <div className="grid grid-cols-3 gap-4">
              <Input label="Centro — latitude" type="number" step="any" required value={form.centerLat} onChange={(e) => setForm({ ...form, centerLat: e.target.value })} />
              <Input label="Centro — longitude" type="number" step="any" required value={form.centerLng} onChange={(e) => setForm({ ...form, centerLng: e.target.value })} />
              <Input label="Raio (metros)" type="number" step="1" min="1" required value={form.radiusMeters} onChange={(e) => setForm({ ...form, radiusMeters: e.target.value })} />
            </div>
          ) : (
            <div>
              <p className="mb-2 text-sm font-medium">Pontos do polígono (mínimo 3)</p>
              <div className="flex flex-col gap-2">
                {form.points.map((point, i) => (
                  <div key={i} className="grid grid-cols-2 gap-2">
                    <Input placeholder={`Latitude ${i + 1}`} type="number" step="any" value={point.lat} onChange={(e) => updatePoint(i, 'lat', e.target.value)} />
                    <Input placeholder={`Longitude ${i + 1}`} type="number" step="any" value={point.lng} onChange={(e) => updatePoint(i, 'lng', e.target.value)} />
                  </div>
                ))}
              </div>
              <Button type="button" variant="secondary" className="mt-2" onClick={() => setForm((p) => ({ ...p, points: [...p.points, { ...EMPTY_POINT }] }))}>
                <Plus size={14} /> Adicionar ponto
              </Button>
            </div>
          )}

          <p className="text-sm font-medium">Regras de preço nesta zona (opcional — sem preencher, usa a configuração geral)</p>
          <div className="grid grid-cols-3 gap-4">
            <Input label="Multiplicador" type="number" step="0.01" value={form.multiplier} onChange={(e) => setForm({ ...form, multiplier: e.target.value })} />
            <Input label="Valor fixo (R$)" type="number" step="0.01" value={form.fixedPrice} onChange={(e) => setForm({ ...form, fixedPrice: e.target.value })} />
            <Input label="Tarifa mínima (R$)" type="number" step="0.01" value={form.minimumFare} onChange={(e) => setForm({ ...form, minimumFare: e.target.value })} />
            <Input label="Valor/km (R$)" type="number" step="0.01" value={form.perKm} onChange={(e) => setForm({ ...form, perKm: e.target.value })} />
            <Input label="Valor/min (R$)" type="number" step="0.01" value={form.perMinute} onChange={(e) => setForm({ ...form, perMinute: e.target.value })} />
            <Input label="Tarifa base (R$)" type="number" step="0.01" value={form.baseFare} onChange={(e) => setForm({ ...form, baseFare: e.target.value })} />
          </div>

          <p className="text-sm font-medium">Vigência</p>
          <div className="grid grid-cols-3 gap-4">
            <Input label="Prioridade" type="number" step="1" min="0" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
            <Input label="Início (HH:mm, opcional)" placeholder="18:00" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
            <Input label="Fim (HH:mm, opcional)" placeholder="06:00" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
          </div>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_LABEL.map((label, day) => (
              <button
                type="button"
                key={day}
                onClick={() => toggleDay(day)}
                aria-pressed={form.daysOfWeek.includes(day)}
                className={`rounded-full border px-3 py-1 text-xs ${form.daysOfWeek.includes(day) ? 'border-brand bg-brand/10 text-brand' : 'border-border text-muted'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            Zona ativa
          </label>

          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" disabled={saveMutation.isPending} className="mt-1">
            {saveMutation.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
