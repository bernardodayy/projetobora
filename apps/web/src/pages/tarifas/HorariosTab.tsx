import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../features/auth/auth-context';
import { PricingSchedule, WEEKDAY_LABEL } from './types';

const EMPTY_FORM = { id: '', name: '', startTime: '', endTime: '', multiplier: '1.0', daysOfWeek: [] as number[], priority: '0' };

export function HorariosTab() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('tarifas.editar');
  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const listQuery = useQuery<PricingSchedule[]>({ queryKey: ['pricing-schedules'], queryFn: () => api.get('/pricing/schedules').then((r) => r.data) });

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        startTime: form.startTime,
        endTime: form.endTime,
        multiplier: Number(form.multiplier),
        daysOfWeek: form.daysOfWeek,
        priority: Number(form.priority),
      };
      return form.id ? api.patch(`/pricing/schedules/${form.id}`, payload) : api.post('/pricing/schedules', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pricing-schedules'] });
      setModalOpen(false);
    },
    onError: (err: any) => setError(err?.response?.data?.message ?? 'Não foi possível salvar o horário.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/pricing/schedules/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pricing-schedules'] }),
  });

  function openCreate() {
    setForm(EMPTY_FORM);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(schedule: PricingSchedule) {
    setForm({
      id: schedule.id,
      name: schedule.name,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      multiplier: schedule.multiplier,
      daysOfWeek: schedule.daysOfWeek,
      priority: String(schedule.priority),
    });
    setError(null);
    setModalOpen(true);
  }

  function toggleDay(day: number) {
    setForm((prev) => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(day) ? prev.daysOfWeek.filter((d) => d !== day) : [...prev.daysOfWeek, day],
    }));
  }

  const schedules = listQuery.data ?? [];

  return (
    <div>
      {canEdit && (
        <div className="mb-4 flex justify-end">
          <Button onClick={openCreate}>
            <Plus size={16} /> Novo horário
          </Button>
        </div>
      )}

      <Card>
        {listQuery.isLoading ? (
          <div className="space-y-2 p-5">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : schedules.length === 0 ? (
          <EmptyState title="Nenhum horário configurado" description="Sem regras de horário, o multiplicador é sempre 1×." />
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th className="px-5 py-3 font-medium">Nome</th>
                <th className="px-5 py-3 font-medium">Janela</th>
                <th className="px-5 py-3 font-medium">Dias</th>
                <th className="px-5 py-3 font-medium">Multiplicador</th>
                <th className="px-5 py-3 font-medium">Prioridade</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((schedule) => (
                <tr key={schedule.id} className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-hover" onClick={() => canEdit && openEdit(schedule)}>
                  <td className="px-5 py-3 font-medium">{schedule.name}</td>
                  <td className="px-5 py-3 text-muted">{schedule.startTime} – {schedule.endTime}</td>
                  <td className="px-5 py-3 text-muted">{schedule.daysOfWeek.length === 0 ? 'Todos os dias' : schedule.daysOfWeek.map((d) => WEEKDAY_LABEL[d]).join(', ')}</td>
                  <td className="px-5 py-3">
                    <Badge tone="brand">{schedule.multiplier}×</Badge>
                  </td>
                  <td className="px-5 py-3 text-muted">{schedule.priority}</td>
                  <td className="px-5 py-3 text-right">
                    {canEdit && (
                      <button
                        onClick={(e) => { e.stopPropagation(); confirm(`Excluir horário "${schedule.name}"?`) && deleteMutation.mutate(schedule.id); }}
                        className="text-muted hover:text-danger"
                        aria-label={`Excluir horário ${schedule.name}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={form.id ? 'Editar horário' : 'Novo horário'}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            saveMutation.mutate();
          }}
        >
          <Input label="Nome" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Início (HH:mm)" required placeholder="18:00" pattern="\d{2}:\d{2}" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
            <Input label="Fim (HH:mm)" required placeholder="00:00" pattern="\d{2}:\d{2}" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Multiplicador" type="number" step="0.01" min="0" required value={form.multiplier} onChange={(e) => setForm({ ...form, multiplier: e.target.value })} />
            <Input label="Prioridade" type="number" step="1" min="0" required value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Dias da semana (vazio = todos os dias)</p>
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
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" disabled={saveMutation.isPending} className="mt-1">
            {saveMutation.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
