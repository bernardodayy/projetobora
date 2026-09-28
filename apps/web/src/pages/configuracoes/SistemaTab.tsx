import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Waypoints } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card, CardBody } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../features/auth/auth-context';
import { SistemaConfig } from './types';

const EMPTY: SistemaConfig = { nomeEmpresa: '', telefone: '', email: '', corPrimaria: '#0D857A', logoUrl: '' };

export function SistemaTab() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('configuracoes.editar');
  const queryClient = useQueryClient();

  const [form, setForm] = useState<SistemaConfig>(EMPTY);
  const [saved, setSaved] = useState(false);

  const query = useQuery<{ sistema: SistemaConfig }>({ queryKey: ['configuracoes'], queryFn: () => api.get('/configuracoes').then((r) => r.data) });

  useEffect(() => {
    if (query.data) setForm({ ...EMPTY, ...query.data.sistema });
  }, [query.data]);

  const saveMutation = useMutation({
    mutationFn: () => api.patch('/configuracoes/sistema', { telefone: form.telefone, email: form.email }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configuracoes'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  if (query.isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardBody>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate();
            }}
          >
            <Input label="Telefone de suporte" disabled={!canEdit} value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="(11) 0000-0000" />
            <Input label="E-mail de suporte" type="email" disabled={!canEdit} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="contato@empresa.com" />

            <div className="mt-2 rounded-lg border border-border bg-canvas p-4">
              <p className="text-sm font-medium">Identidade visual</p>
              <p className="mb-3 mt-1 text-xs text-muted">
                Nome, cor e logo são definidos pela equipe de desenvolvimento antes do lançamento e não podem ser alterados por aqui.
              </p>
              <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-sm">
                <dt className="text-muted">Nome</dt>
                <dd className="font-medium">{form.nomeEmpresa}</dd>
                <dt className="text-muted">Cor da marca</dt>
                <dd className="flex items-center gap-2 font-medium">
                  <span className="inline-block h-4 w-4 rounded border border-border" style={{ backgroundColor: form.corPrimaria }} />
                  {form.corPrimaria}
                </dd>
                <dt className="text-muted">Logo</dt>
                <dd className="truncate font-medium">{form.logoUrl || 'Ícone padrão'}</dd>
              </dl>
            </div>

            {canEdit && (
              <Button type="submit" disabled={saveMutation.isPending} className="mt-1">
                {saveMutation.isPending ? 'Salvando…' : saved ? 'Salvo ✓' : 'Salvar'}
              </Button>
            )}
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <p className="mb-3 text-sm font-medium">Pré-visualização</p>
          <div className="rounded-lg border border-border bg-canvas p-4">
            <div className="flex items-center gap-2 rounded-lg bg-surface p-3">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg text-white"
                style={{ backgroundColor: form.corPrimaria }}
              >
                {form.logoUrl ? <img src={form.logoUrl} alt="" className="h-full w-full object-cover" /> : <Waypoints size={16} />}
              </div>
              <p className="truncate text-sm font-semibold">{form.nomeEmpresa || 'Nome da empresa'}</p>
            </div>
            <button
              type="button"
              disabled
              className="mt-3 w-full rounded-lg px-3 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: form.corPrimaria }}
            >
              Botão de exemplo
            </button>
          </div>
          <p className="mt-3 text-xs text-muted">Assim aparecem o topo e os botões principais dos apps do cliente e do motorista. A Central mantém sempre o próprio nome e as próprias cores.</p>
        </CardBody>
      </Card>
    </div>
  );
}
