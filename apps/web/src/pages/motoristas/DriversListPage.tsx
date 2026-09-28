import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { Pagination } from '../../components/ui/Pagination';
import { fetchPage, PAGE_SIZE, Paged, usePage } from '../../lib/paged';
import { isValidCpf } from '../../lib/cpf';
import { receivesLabel } from '../../lib/payment';
import { ReasonModal } from '../../components/ReasonModal';
import { useAuth } from '../../features/auth/auth-context';
import { AVAILABILITY_LABEL, DriverDetail, DriverRow, STATUS_LABEL, STATUS_TONE, formatCpf } from './types';

const EMPTY_FORM = {
  id: '',
  name: '',
  cpf: '',
  phone: '',
  cnh: '',
  cnhCategory: '',
  plate: '',
  model: '',
  brand: '',
  pixKey: '',
  hasCardMachine: false,
};

export function DriversListPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState({ name: '', cpf: '', status: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);
  const [locationForm, setLocationForm] = useState({ lat: '', lng: '' });
  const [passwordForm, setPasswordForm] = useState('');
  const [passwordSaved, setPasswordSaved] = useState(false);

  const [page, setPage] = usePage(filters);
  const listQuery = useQuery<Paged<DriverRow>>({
    queryKey: ['drivers', filters, page],
    queryFn: () => fetchPage('/drivers', { name: filters.name || undefined, cpf: filters.cpf || undefined, status: filters.status || undefined }, page),
    placeholderData: keepPreviousData,
  });

  const detailQuery = useQuery<DriverDetail>({
    queryKey: ['drivers', form.id],
    queryFn: () => api.get(`/drivers/${form.id}`).then((r) => r.data),
    enabled: !!form.id && modalOpen,
  });

  useEffect(() => {
    if (detailQuery.data) {
      setLocationForm({ lat: detailQuery.data.lastLat ?? '', lng: detailQuery.data.lastLng ?? '' });
    }
  }, [detailQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (): Promise<unknown> => {
      const vehicle = { plate: form.plate, model: form.model, brand: form.brand };
      if (form.id) {
        return api.patch(`/drivers/${form.id}`, {
          name: form.name,
          phone: form.phone,
          cnh: form.cnh,
          cnhCategory: form.cnhCategory,
          pixKey: form.pixKey,
          hasCardMachine: form.hasCardMachine,
          vehicle,
        });
      }
      return api.post('/drivers', { name: form.name, cpf: form.cpf, phone: form.phone, cnh: form.cnh, cnhCategory: form.cnhCategory, pixKey: form.pixKey || undefined, hasCardMachine: form.hasCardMachine, vehicle });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      setModalOpen(false);
    },
    onError: (error: any) => setFormError(error?.response?.data?.message ?? 'Não foi possível salvar o motorista.'),
  });

  const blockMutation = useMutation({
    mutationFn: (reason: string) => api.post(`/drivers/${form.id}/block`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      setBlockOpen(false);
      setModalOpen(false);
    },
  });

  const unblockMutation = useMutation({
    mutationFn: () => api.post(`/drivers/${form.id}/unblock`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      setModalOpen(false);
    },
  });

  const locationMutation = useMutation({
    mutationFn: () => api.patch(`/drivers/${form.id}/location`, { lat: Number(locationForm.lat), lng: Number(locationForm.lng) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['drivers'] }),
  });

  const passwordMutation = useMutation({
    mutationFn: () => api.patch(`/drivers/${form.id}/password`, { password: passwordForm }),
    onSuccess: () => {
      setPasswordForm('');
      setPasswordSaved(true);
      setTimeout(() => setPasswordSaved(false), 2000);
    },
  });

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setPasswordForm('');
    setModalOpen(true);
  }

  function openEdit(driver: DriverRow) {
    const vehicle = driver.vehicles[0];
    setForm({
      id: driver.id,
      name: driver.name,
      cpf: driver.cpf,
      phone: driver.phone,
      cnh: driver.cnh,
      cnhCategory: driver.cnhCategory,
      plate: vehicle?.plate ?? '',
      model: vehicle?.model ?? '',
      brand: vehicle?.brand ?? '',
      pixKey: driver.pixKey ?? '',
      hasCardMachine: driver.hasCardMachine,
    });
    setFormError(null);
    setPasswordForm('');
    setModalOpen(true);
  }

  const drivers = listQuery.data?.items ?? [];
  const canEdit = hasPermission('motoristas.editar');
  const canBlock = hasPermission('motoristas.bloquear');

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex flex-wrap gap-3">
          <Input placeholder="Buscar por nome" value={filters.name} onChange={(e) => setFilters({ ...filters, name: e.target.value })} className="w-56" />
          <Input placeholder="Buscar por CPF" value={filters.cpf} onChange={(e) => setFilters({ ...filters, cpf: e.target.value })} className="w-44" />
          <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="w-48">
            <option value="">Todos os status</option>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        {canEdit && (
          <Button onClick={openCreate}>
            <Plus size={16} /> Novo motorista
          </Button>
        )}
      </div>

      <Card>
        {listQuery.isLoading ? (
          <div className="space-y-2 p-5">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : drivers.length === 0 ? (
          <EmptyState title="Nenhum motorista encontrado" description="Ajuste os filtros ou cadastre o primeiro motorista." />
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th className="px-5 py-3 font-medium">Nome</th>
                <th className="px-5 py-3 font-medium">Veículo</th>
                <th className="px-5 py-3 font-medium">Recebe</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Disponibilidade</th>
                <th className="px-5 py-3 font-medium">Avaliação</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((driver) => (
                <tr key={driver.id} onClick={() => openEdit(driver)} className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-hover">
                  <td className="px-5 py-3">
                    <p className="font-medium">{driver.name}</p>
                    <p className="text-xs text-muted">{formatCpf(driver.cpf)}</p>
                  </td>
                  <td className="px-5 py-3 text-muted">
                    {driver.vehicles[0] ? `${driver.vehicles[0].plate} · ${driver.vehicles[0].model}` : '—'}
                  </td>
                  <td className="px-5 py-3 text-muted">{receivesLabel(driver)}</td>
                  <td className="px-5 py-3">
                    <Badge tone={STATUS_TONE[driver.status]}>{STATUS_LABEL[driver.status]}</Badge>
                  </td>
                  <td className="px-5 py-3 text-muted">{AVAILABILITY_LABEL[driver.availability]}</td>
                  <td className="px-5 py-3 text-muted">{driver.rating ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={page} total={listQuery.data?.total ?? 0} pageSize={PAGE_SIZE} onChange={setPage} />
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={form.id ? 'Editar motorista' : 'Novo motorista'} size="lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            // Só no cadastro: o CPF de motorista já cadastrado fica travado e não é revalidado.
            if (!form.id && !isValidCpf(form.cpf)) {
              setFormError('CPF inválido — confira os números.');
              return;
            }
            setFormError(null);
            saveMutation.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <Input label="Nome" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input
              label="CPF"
              required
              disabled={!!form.id}
              maxLength={11}
              value={form.cpf}
              onChange={(e) => setForm({ ...form, cpf: e.target.value.replace(/\D/g, '') })}
            />
            <Input label="Telefone" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input label="CNH" required value={form.cnh} onChange={(e) => setForm({ ...form, cnh: e.target.value })} />
            <Input label="Categoria CNH" required value={form.cnhCategory} onChange={(e) => setForm({ ...form, cnhCategory: e.target.value })} />
          </div>

          <p className="text-sm font-medium">Como recebe</p>
          <p className="-mt-2 text-xs text-muted">
            O passageiro paga direto ao motorista, fora do app. Corrida no Pix só vai para quem tem chave cadastrada; no cartão, só para
            quem tem máquina no carro.
          </p>
          <div className="grid grid-cols-2 items-end gap-4">
            <Input label="Chave Pix" value={form.pixKey} onChange={(e) => setForm({ ...form, pixKey: e.target.value })} />
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input type="checkbox" checked={form.hasCardMachine} onChange={(e) => setForm({ ...form, hasCardMachine: e.target.checked })} />
              Tem máquina de cartão
            </label>
          </div>

          <p className="text-sm font-medium">Veículo</p>
          <div className="grid grid-cols-3 gap-4">
            <Input label="Placa" required value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value.toUpperCase() })} />
            <Input label="Marca" required value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
            <Input label="Modelo" required value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          </div>

          {formError && <p className="text-sm text-danger">{formError}</p>}
          <Button type="submit" disabled={saveMutation.isPending} className="mt-1">
            {saveMutation.isPending ? 'Salvando…' : 'Salvar'}
          </Button>

          {form.id && canEdit && (
            <div className="border-t border-border pt-4">
              <p className="mb-2 text-sm font-medium">Localização no mapa operacional</p>
              <div className="grid grid-cols-3 gap-2">
                <Input placeholder="Latitude" type="number" step="any" value={locationForm.lat} onChange={(e) => setLocationForm({ ...locationForm, lat: e.target.value })} />
                <Input placeholder="Longitude" type="number" step="any" value={locationForm.lng} onChange={(e) => setLocationForm({ ...locationForm, lng: e.target.value })} />
                <Button type="button" variant="secondary" disabled={!locationForm.lat || !locationForm.lng || locationMutation.isPending} onClick={() => locationMutation.mutate()}>
                  Atualizar
                </Button>
              </div>
            </div>
          )}

          {form.id && canEdit && (
            <div className="border-t border-border pt-4">
              <p className="mb-2 text-sm font-medium">Senha do app do motorista</p>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Input
                  type="password"
                  placeholder="Nova senha (mín. 6 caracteres)"
                  value={passwordForm}
                  onChange={(e) => setPasswordForm(e.target.value)}
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={passwordForm.length < 6 || passwordMutation.isPending}
                  onClick={() => passwordMutation.mutate()}
                >
                  {passwordMutation.isPending ? 'Salvando…' : passwordSaved ? 'Definida ✓' : 'Definir senha'}
                </Button>
              </div>
              <p className="mt-1 text-xs text-muted">O motorista usa o CPF e essa senha para entrar no app.</p>
            </div>
          )}

          {form.id && canBlock && detailQuery.data && (
            <div className="mt-2 border-t border-border pt-4">
              {detailQuery.data.status === 'BLOCKED' ? (
                <Button type="button" variant="secondary" className="w-full" disabled={unblockMutation.isPending} onClick={() => unblockMutation.mutate()}>
                  Desbloquear motorista
                </Button>
              ) : (
                <Button type="button" variant="danger" className="w-full" onClick={() => setBlockOpen(true)}>
                  Bloquear motorista
                </Button>
              )}
            </div>
          )}
        </form>
      </Modal>

      <ReasonModal
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        title="Bloquear motorista"
        label="Motivo do bloqueio"
        confirmLabel="Confirmar bloqueio"
        loading={blockMutation.isPending}
        onConfirm={(reason) => blockMutation.mutate(reason)}
      />
    </div>
  );
}
