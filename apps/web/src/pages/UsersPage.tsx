import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { useAuth } from '../features/auth/auth-context';

interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  status: 'ACTIVE' | 'BLOCKED';
  role: { id: string; name: string };
}

interface RoleOption {
  id: string;
  name: string;
}

interface FormState {
  id?: string;
  name: string;
  email: string;
  password: string;
  roleId: string;
  status: 'ACTIVE' | 'BLOCKED';
}

const EMPTY_FORM: FormState = { name: '', email: '', password: '', roleId: '', status: 'ACTIVE' };

export function UsersPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const usersQuery = useQuery<AdminUserRow[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then((r) => r.data),
  });
  const rolesQuery = useQuery<RoleOption[]>({
    queryKey: ['roles'],
    queryFn: () => api.get('/roles').then((r) => r.data),
  });

  const saveMutation = useMutation({
    mutationFn: async (data: FormState) => {
      const payload: Record<string, unknown> = { name: data.name, email: data.email, roleId: data.roleId };
      if (data.id) {
        payload.status = data.status;
        if (data.password) payload.password = data.password;
        return api.patch(`/users/${data.id}`, payload);
      }
      payload.password = data.password;
      return api.post('/users', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setModalOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: (error: any) => setFormError(error?.response?.data?.message ?? 'Não foi possível salvar o usuário.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(user: AdminUserRow) {
    setForm({ id: user.id, name: user.name, email: user.email, password: '', roleId: user.role.id, status: user.status });
    setFormError(null);
    setModalOpen(true);
  }

  const canManage = hasPermission('usuarios.criar') || hasPermission('usuarios.editar');
  const canDelete = hasPermission('usuarios.excluir');
  const users = usersQuery.data ?? [];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Usuários administrativos</h1>
          <p className="text-sm text-muted">Gerencie quem acessa a Central de Controle e com quais cargos.</p>
        </div>
        {hasPermission('usuarios.criar') && (
          <Button onClick={openCreate}>
            <Plus size={16} /> Novo usuário
          </Button>
        )}
      </div>

      <Card>
        {usersQuery.isLoading ? (
          <div className="space-y-2 p-5">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <EmptyState title="Nenhum usuário cadastrado" description="Crie o primeiro usuário administrativo." />
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th className="px-5 py-3 font-medium">Nome</th>
                <th className="px-5 py-3 font-medium">E-mail</th>
                <th className="px-5 py-3 font-medium">Cargo</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-border last:border-0 hover:bg-surface-hover">
                  <td className="px-5 py-3 font-medium">{user.name}</td>
                  <td className="px-5 py-3 text-muted">{user.email}</td>
                  <td className="px-5 py-3">{user.role.name}</td>
                  <td className="px-5 py-3">
                    <Badge tone={user.status === 'ACTIVE' ? 'success' : 'danger'}>
                      {user.status === 'ACTIVE' ? 'Ativo' : 'Bloqueado'}
                    </Badge>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-2">
                      {canManage && (
                        <button onClick={() => openEdit(user)} className="text-muted hover:text-ink" aria-label="Editar">
                          <Pencil size={15} />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => confirm(`Excluir ${user.name}?`) && deleteMutation.mutate(user.id)}
                          className="text-muted hover:text-danger"
                          aria-label="Excluir"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={form.id ? 'Editar usuário' : 'Novo usuário'}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate(form);
          }}
        >
          <Input label="Nome" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input
            label="E-mail"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            label={form.id ? 'Nova senha (opcional)' : 'Senha'}
            type="password"
            required={!form.id}
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <Select
            label="Cargo"
            required
            value={form.roleId}
            onChange={(e) => setForm({ ...form, roleId: e.target.value })}
          >
            <option value="" disabled>
              Selecione um cargo
            </option>
            {(rolesQuery.data ?? []).map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </Select>
          {form.id && (
            <Select
              label="Status"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as FormState['status'] })}
            >
              <option value="ACTIVE">Ativo</option>
              <option value="BLOCKED">Bloqueado</option>
            </Select>
          )}
          {formError && <p className="text-sm text-danger">{formError}</p>}
          <Button type="submit" disabled={saveMutation.isPending} className="mt-1">
            {saveMutation.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
