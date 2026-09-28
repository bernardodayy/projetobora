import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Badge } from '../components/ui/Badge';
import { Tabs } from '../components/ui/Tabs';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { Pagination } from '../components/ui/Pagination';
import { fetchPage, PAGE_SIZE, Paged, usePage } from '../lib/paged';
import { useAuth } from '../features/auth/auth-context';
import { STATUS_LABEL, STATUS_TONE } from './corridas/types';
import { isValidCpf } from '../lib/cpf';

interface CustomerRow {
  id: string;
  name: string;
  cpf: string;
  phone: string;
  email: string | null;
  status: 'ACTIVE' | 'BLOCKED';
  blockedReason: string | null;
  createdAt: string;
}

interface CustomerAddress {
  id: string;
  label: string | null;
  address: string;
  lat: string;
  lng: string;
}

interface CustomerDetail extends CustomerRow {
  addresses: CustomerAddress[];
}

const EMPTY_CREATE_FORM = { name: '', cpf: '', phone: '', email: '' };
const EMPTY_ADDRESS_FORM = { label: '', address: '', lat: '', lng: '' };

function formatCpf(cpf: string) {
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function formatCurrency(value: string) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function ClientesPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState({ name: '', cpf: '', status: '' });
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [createError, setCreateError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'dados' | 'enderecos' | 'historico'>('dados');
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [addressForm, setAddressForm] = useState(EMPTY_ADDRESS_FORM);
  const [passwordForm, setPasswordForm] = useState('');
  const [passwordSaved, setPasswordSaved] = useState(false);

  const [page, setPage] = usePage(filters);
  const listQuery = useQuery<Paged<CustomerRow>>({
    queryKey: ['customers', filters, page],
    queryFn: () => fetchPage('/customers', { name: filters.name || undefined, cpf: filters.cpf || undefined, status: filters.status || undefined }, page),
    placeholderData: keepPreviousData,
  });

  const detailQuery = useQuery<CustomerDetail>({
    queryKey: ['customers', selectedId],
    queryFn: () => api.get(`/customers/${selectedId}`).then((r) => r.data),
    enabled: !!selectedId,
  });

  const createMutation = useMutation({
    mutationFn: () => api.post('/customers', createForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setCreateOpen(false);
      setCreateForm(EMPTY_CREATE_FORM);
    },
    onError: (error: any) => setCreateError(error?.response?.data?.message ?? 'Não foi possível criar o cliente.'),
  });

  const blockMutation = useMutation({
    mutationFn: () => api.post(`/customers/${selectedId}/block`, { reason: blockReason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setBlockOpen(false);
      setBlockReason('');
    },
  });

  const unblockMutation = useMutation({
    mutationFn: () => api.post(`/customers/${selectedId}/unblock`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customers'] }),
  });

  const addAddressMutation = useMutation({
    mutationFn: () =>
      api.post(`/customers/${selectedId}/addresses`, {
        label: addressForm.label || undefined,
        address: addressForm.address,
        lat: Number(addressForm.lat),
        lng: Number(addressForm.lng),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', selectedId] });
      setAddressForm(EMPTY_ADDRESS_FORM);
    },
  });

  const removeAddressMutation = useMutation({
    mutationFn: (addressId: string) => api.delete(`/customers/${selectedId}/addresses/${addressId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customers', selectedId] }),
  });

  const passwordMutation = useMutation({
    mutationFn: () => api.patch(`/customers/${selectedId}/password`, { password: passwordForm }),
    onSuccess: () => {
      setPasswordForm('');
      setPasswordSaved(true);
      setTimeout(() => setPasswordSaved(false), 2000);
    },
  });

  const ridesQuery = useQuery<{ id: string; status: string; originAddress: string; destinationAddress: string; finalPrice: string | null; requestedAt: string }[]>({
    queryKey: ['rides', { customerId: selectedId }],
    queryFn: () => api.get('/rides', { params: { customerId: selectedId } }).then((r) => r.data),
    enabled: !!selectedId && detailTab === 'historico',
  });

  const customers = listQuery.data?.items ?? [];
  const canEdit = hasPermission('clientes.editar');
  const canBlock = hasPermission('clientes.bloquear');

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <p className="text-sm text-muted">Passageiros cadastrados na plataforma.</p>
        </div>
        {canEdit && (
          <Button
            onClick={() => {
              setCreateForm(EMPTY_CREATE_FORM);
              setCreateError(null);
              setCreateOpen(true);
            }}
          >
            <Plus size={16} /> Novo cliente
          </Button>
        )}
      </div>

      <Card className="mb-4">
        <div className="flex flex-wrap gap-3 p-4">
          <Input
            placeholder="Buscar por nome"
            value={filters.name}
            onChange={(e) => setFilters({ ...filters, name: e.target.value })}
            className="w-56"
          />
          <Input
            placeholder="Buscar por CPF"
            value={filters.cpf}
            onChange={(e) => setFilters({ ...filters, cpf: e.target.value })}
            className="w-44"
          />
          <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="w-40">
            <option value="">Todos os status</option>
            <option value="ACTIVE">Ativo</option>
            <option value="BLOCKED">Bloqueado</option>
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
        ) : customers.length === 0 ? (
          <EmptyState title="Nenhum cliente encontrado" description="Ajuste os filtros ou cadastre o primeiro cliente." />
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th className="px-5 py-3 font-medium">Nome</th>
                <th className="px-5 py-3 font-medium">CPF</th>
                <th className="px-5 py-3 font-medium">Telefone</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Cadastro</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr
                  key={customer.id}
                  onClick={() => {
                    setSelectedId(customer.id);
                    setDetailTab('dados');
                    setPasswordForm('');
                  }}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-hover"
                >
                  <td className="px-5 py-3 font-medium">{customer.name}</td>
                  <td className="px-5 py-3 text-muted">{formatCpf(customer.cpf)}</td>
                  <td className="px-5 py-3 text-muted">{customer.phone}</td>
                  <td className="px-5 py-3">
                    <Badge tone={customer.status === 'ACTIVE' ? 'success' : 'danger'}>
                      {customer.status === 'ACTIVE' ? 'Ativo' : 'Bloqueado'}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-muted">{new Date(customer.createdAt).toLocaleDateString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={page} total={listQuery.data?.total ?? 0} pageSize={PAGE_SIZE} onChange={setPage} />
      </Card>

      {/* Criar cliente */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Novo cliente">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!isValidCpf(createForm.cpf)) {
              setCreateError('CPF inválido — confira os números.');
              return;
            }
            setCreateError(null);
            createMutation.mutate();
          }}
        >
          <Input label="Nome" required value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} />
          <Input
            label="CPF (somente números)"
            required
            maxLength={11}
            value={createForm.cpf}
            onChange={(e) => setCreateForm({ ...createForm, cpf: e.target.value.replace(/\D/g, '') })}
          />
          <Input label="Telefone" required value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} />
          <Input label="E-mail (opcional)" type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} />
          {createError && <p className="text-sm text-danger">{createError}</p>}
          <Button type="submit" disabled={createMutation.isPending} className="mt-1">
            {createMutation.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </form>
      </Modal>

      {/* Detalhe do cliente */}
      <Modal open={!!selectedId} onClose={() => setSelectedId(null)} title={detailQuery.data?.name ?? 'Cliente'} size="lg">
        {detailQuery.isLoading || !detailQuery.data ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <Badge tone={detailQuery.data.status === 'ACTIVE' ? 'success' : 'danger'}>
                {detailQuery.data.status === 'ACTIVE' ? 'Ativo' : 'Bloqueado'}
              </Badge>
              {canBlock &&
                (detailQuery.data.status === 'ACTIVE' ? (
                  <Button variant="danger" onClick={() => setBlockOpen(true)}>
                    Bloquear cliente
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => unblockMutation.mutate()} disabled={unblockMutation.isPending}>
                    Desbloquear cliente
                  </Button>
                ))}
            </div>

            <Tabs
              tabs={[
                { key: 'dados', label: 'Dados pessoais' },
                { key: 'enderecos', label: `Endereços (${detailQuery.data.addresses.length})` },
                { key: 'historico', label: 'Histórico de corridas' },
              ]}
              active={detailTab}
              onChange={setDetailTab}
            />

            <div className="pt-4">
              {detailTab === 'dados' && (
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-muted">CPF</dt>
                    <dd className="font-medium">{formatCpf(detailQuery.data.cpf)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Telefone</dt>
                    <dd className="font-medium">{detailQuery.data.phone}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">E-mail</dt>
                    <dd className="font-medium">{detailQuery.data.email ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Cadastrado em</dt>
                    <dd className="font-medium">{new Date(detailQuery.data.createdAt).toLocaleDateString('pt-BR')}</dd>
                  </div>
                  {detailQuery.data.status === 'BLOCKED' && (
                    <div className="col-span-2">
                      <dt className="text-muted">Motivo do bloqueio</dt>
                      <dd className="font-medium text-danger">{detailQuery.data.blockedReason}</dd>
                    </div>
                  )}

                  {canEdit && (
                    <div className="col-span-2 border-t border-border pt-4">
                      <p className="mb-2 text-sm font-medium">Senha do app do cliente</p>
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
                      <p className="mt-1 text-xs text-muted">O cliente usa o CPF e essa senha para entrar no app.</p>
                    </div>
                  )}
                </dl>
              )}

              {detailTab === 'enderecos' && (
                <div className="flex flex-col gap-3">
                  {detailQuery.data.addresses.length === 0 ? (
                    <EmptyState title="Nenhum endereço cadastrado" />
                  ) : (
                    detailQuery.data.addresses.map((addr) => (
                      <div key={addr.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                        <div className="flex items-center gap-2">
                          <MapPin size={15} className="text-muted" />
                          <div>
                            {addr.label && <p className="text-xs text-muted">{addr.label}</p>}
                            <p className="text-sm">{addr.address}</p>
                          </div>
                        </div>
                        {canEdit && (
                          <button
                            onClick={() => removeAddressMutation.mutate(addr.id)}
                            className="text-muted hover:text-danger"
                            aria-label="Remover endereço"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ))
                  )}

                  {canEdit && (
                    <form
                      className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-dashed border-border p-3"
                      onSubmit={(e) => {
                        e.preventDefault();
                        addAddressMutation.mutate();
                      }}
                    >
                      <Input
                        placeholder="Rótulo (ex.: Casa)"
                        value={addressForm.label}
                        onChange={(e) => setAddressForm({ ...addressForm, label: e.target.value })}
                      />
                      <Input
                        placeholder="Endereço completo"
                        required
                        value={addressForm.address}
                        onChange={(e) => setAddressForm({ ...addressForm, address: e.target.value })}
                      />
                      <Input
                        placeholder="Latitude"
                        required
                        type="number"
                        step="any"
                        value={addressForm.lat}
                        onChange={(e) => setAddressForm({ ...addressForm, lat: e.target.value })}
                      />
                      <Input
                        placeholder="Longitude"
                        required
                        type="number"
                        step="any"
                        value={addressForm.lng}
                        onChange={(e) => setAddressForm({ ...addressForm, lng: e.target.value })}
                      />
                      <Button type="submit" variant="secondary" disabled={addAddressMutation.isPending} className="col-span-2">
                        Adicionar endereço
                      </Button>
                    </form>
                  )}
                </div>
              )}

              {detailTab === 'historico' &&
                (ridesQuery.isLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : !ridesQuery.data || ridesQuery.data.length === 0 ? (
                  <EmptyState title="Nenhuma corrida ainda" description="O histórico aparece aqui assim que o cliente fizer a primeira corrida." />
                ) : (
                  <ul className="flex flex-col gap-2">
                    {ridesQuery.data.map((ride) => (
                      <li key={ride.id} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                        <div>
                          <p className="font-medium">
                            {ride.originAddress} → {ride.destinationAddress}
                          </p>
                          <p className="text-xs text-muted">{new Date(ride.requestedAt).toLocaleString('pt-BR')}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          {ride.finalPrice && <span className="text-muted">{formatCurrency(ride.finalPrice)}</span>}
                          <Badge tone={STATUS_TONE[ride.status as keyof typeof STATUS_TONE]}>
                            {STATUS_LABEL[ride.status as keyof typeof STATUS_LABEL]}
                          </Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                ))}
            </div>
          </div>
        )}
      </Modal>

      {/* Bloquear cliente */}
      <Modal open={blockOpen} onClose={() => setBlockOpen(false)} title="Bloquear cliente">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            blockMutation.mutate();
          }}
        >
          <Input
            label="Motivo do bloqueio"
            required
            minLength={3}
            value={blockReason}
            onChange={(e) => setBlockReason(e.target.value)}
            placeholder="Ex.: comportamento inadequado relatado por motorista"
          />
          <Button type="submit" variant="danger" disabled={blockMutation.isPending}>
            {blockMutation.isPending ? 'Bloqueando…' : 'Confirmar bloqueio'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
