import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Skeleton } from '../components/ui/Skeleton';
import { useAuth } from '../features/auth/auth-context';

interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
}

interface PermissionRow {
  id: string;
  slug: string;
  module: string;
  action: string;
}

interface FormState {
  id?: string;
  name: string;
  description: string;
  permissionSlugs: string[];
}

const EMPTY_FORM: FormState = { name: '', description: '', permissionSlugs: [] };

export function RolesPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const rolesQuery = useQuery<RoleRow[]>({ queryKey: ['roles'], queryFn: () => api.get('/roles').then((r) => r.data) });
  const permissionsQuery = useQuery<PermissionRow[]>({
    queryKey: ['permissions'],
    queryFn: () => api.get('/roles/permissions').then((r) => r.data),
  });

  const saveMutation = useMutation({
    mutationFn: (data: FormState) => {
      const payload = { name: data.name, description: data.description || undefined, permissionSlugs: data.permissionSlugs };
      return data.id ? api.patch(`/roles/${data.id}`, payload) : api.post('/roles', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      setModalOpen(false);
    },
    onError: (error: any) => setFormError(error?.response?.data?.message ?? 'Não foi possível salvar o cargo.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/roles/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles'] }),
    onError: (error: any) => alert(error?.response?.data?.message ?? 'Não foi possível excluir o cargo.'),
  });

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(role: RoleRow) {
    setForm({ id: role.id, name: role.name, description: role.description ?? '', permissionSlugs: role.permissions });
    setFormError(null);
    setModalOpen(true);
  }

  function togglePermission(slug: string) {
    setForm((prev) => ({
      ...prev,
      permissionSlugs: prev.permissionSlugs.includes(slug)
        ? prev.permissionSlugs.filter((s) => s !== slug)
        : [...prev.permissionSlugs, slug],
    }));
  }

  const groupedPermissions = (permissionsQuery.data ?? []).reduce<Record<string, PermissionRow[]>>((acc, p) => {
    (acc[p.module] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Cargos e permissões</h1>
          <p className="text-sm text-muted">Defina o que cada cargo pode visualizar e alterar na Central.</p>
        </div>
        {hasPermission('usuarios.criar') && (
          <Button onClick={openCreate}>
            <Plus size={16} /> Novo cargo
          </Button>
        )}
      </div>

      {rolesQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(rolesQuery.data ?? []).map((role) => (
            <Card key={role.id}>
              <CardBody>
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <p className="font-medium">{role.name}</p>
                    <p className="text-xs text-muted">{role.description}</p>
                  </div>
                  {role.isSystem && (
                    <span title="Cargo padrão do sistema">
                      <Lock size={14} className="text-muted" />
                    </span>
                  )}
                </div>
                <Badge tone="brand">{role.permissions.length} permissões</Badge>
                <div className="mt-4 flex gap-2">
                  {hasPermission('usuarios.editar') && role.name !== 'Administrador Master' && (
                    <Button variant="secondary" onClick={() => openEdit(role)} className="flex-1">
                      <Pencil size={14} /> Editar
                    </Button>
                  )}
                  {!role.isSystem && hasPermission('usuarios.excluir') && (
                    <button
                      onClick={() => confirm(`Excluir o cargo ${role.name}?`) && deleteMutation.mutate(role.id)}
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={form.id ? 'Editar cargo' : 'Novo cargo'}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate(form);
          }}
        >
          <Input label="Nome" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input
            label="Descrição"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />

          <div>
            <p className="mb-2 text-sm font-medium">Permissões</p>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-border p-3">
              {Object.entries(groupedPermissions).map(([module, perms]) => (
                <div key={module} className="mb-3 last:mb-0">
                  <p className="mb-1.5 text-xs font-semibold uppercase text-muted">{module}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {perms.map((p) => (
                      <label key={p.slug} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.permissionSlugs.includes(p.slug)}
                          onChange={() => togglePermission(p.slug)}
                          className="rounded border-border text-brand focus:ring-brand/40"
                        />
                        {p.action}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {formError && <p className="text-sm text-danger">{formError}</p>}
          <Button type="submit" disabled={saveMutation.isPending} className="mt-1">
            {saveMutation.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
