import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Waypoints } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card, CardBody } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';

interface Marca {
  nomeEmpresa: string;
  corPrimaria: string;
  logoUrl: string;
}

const EMPTY: Marca = { nomeEmpresa: '', corPrimaria: '#0D857A', logoUrl: '' };

// Aba exclusiva da equipe de desenvolvimento (permissão desenvolvedor.marca — dono e
// admin não têm e não conseguem se dar). Vale só para os apps do cliente e do
// motorista; a Central nunca muda de nome nem de cor por causa disto.
export function MarcaPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Marca>(EMPTY);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery<Marca>({ queryKey: ['desenvolvedor-marca'], queryFn: () => api.get('/desenvolvedor/marca').then((r) => r.data) });

  useEffect(() => {
    if (query.data) setForm({ ...EMPTY, ...query.data });
  }, [query.data]);

  const saveMutation = useMutation({
    mutationFn: () => api.patch('/desenvolvedor/marca', form),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['desenvolvedor-marca'] });
      queryClient.invalidateQueries({ queryKey: ['configuracoes'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err: any) => {
      const message = err?.response?.data?.message;
      setError(Array.isArray(message) ? message.join(' · ') : (message ?? 'Não foi possível salvar.'));
    },
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Marca dos apps</h1>
        <p className="text-sm text-muted">
          Nome e cor dos apps do cliente e do motorista. Só a equipe de desenvolvimento vê esta aba; a Central não muda por causa disto.
        </p>
      </div>

      {query.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
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
                <Input label="Nome no topo do app" required value={form.nomeEmpresa} onChange={(e) => setForm({ ...form, nomeEmpresa: e.target.value })} placeholder="BORA 25" />
                <div className="flex items-end gap-3">
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="font-medium text-ink">Cor da marca</span>
                    <input
                      type="color"
                      value={form.corPrimaria}
                      onChange={(e) => setForm({ ...form, corPrimaria: e.target.value })}
                      className="h-10 w-16 cursor-pointer rounded-lg border border-border bg-surface p-1"
                    />
                  </label>
                  <Input label="Código hexadecimal" className="w-32" value={form.corPrimaria} onChange={(e) => setForm({ ...form, corPrimaria: e.target.value })} />
                </div>
                <Input label="URL da logo (opcional)" value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} placeholder="https://minhaempresa.com/logo.png" />
                <p className="text-xs text-muted">
                  Os apps leem a marca quando abrem: quem já estiver com o app aberto precisa fechar e abrir de novo. Esta configuração vale mais que
                  BRAND_* do .env da API.
                </p>
                {error && <p className="text-sm text-danger">{error}</p>}
                <Button type="submit" disabled={saveMutation.isPending} className="mt-1">
                  {saveMutation.isPending ? 'Salvando…' : saved ? 'Salvo ✓' : 'Salvar'}
                </Button>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <p className="mb-3 text-sm font-medium">Pré-visualização</p>
              <div className="rounded-lg border border-border bg-canvas p-4">
                <span className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-extrabold text-white shadow-sm" style={{ backgroundColor: form.corPrimaria }}>
                  {form.logoUrl ? <img src={form.logoUrl} alt="" className="h-5 w-5 rounded object-cover" /> : <Waypoints size={14} />}
                  {form.nomeEmpresa || 'Nome do app'}
                </span>
                <button type="button" disabled className="mt-4 w-full rounded-xl px-3 py-2.5 text-sm font-semibold text-white" style={{ backgroundColor: form.corPrimaria }}>
                  Botão principal
                </button>
              </div>
              <p className="mt-3 text-xs text-muted">Assim aparecem a pílula do topo e os botões principais nos apps.</p>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
