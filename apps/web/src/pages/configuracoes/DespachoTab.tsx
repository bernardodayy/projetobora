import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card, CardBody } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../features/auth/auth-context';
import { DespachoConfig } from './types';

const EMPTY: DespachoConfig = { tempoOfertaSegundos: 15, tempoEsperaMinutos: 2, distanciaMaximaKm: 30, tentativasDespacho: 3, raioProcuraKm: 5 };

export function DespachoTab() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('configuracoes.editar');
  const queryClient = useQueryClient();

  const [form, setForm] = useState<DespachoConfig>(EMPTY);
  const [saved, setSaved] = useState(false);

  const query = useQuery<{ despacho: DespachoConfig }>({ queryKey: ['configuracoes'], queryFn: () => api.get('/configuracoes').then((r) => r.data) });

  useEffect(() => {
    if (query.data) setForm(query.data.despacho);
  }, [query.data]);

  const saveMutation = useMutation({
    mutationFn: () => api.patch('/configuracoes/despacho', form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configuracoes'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  if (query.isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card className="max-w-xl">
      <CardBody>
        <p className="mb-4 text-sm text-muted">
          Parâmetros do despacho automático de motoristas: toda corrida criada sem motorista definido já busca o
          mais próximo por conta própria. Raio de procura e distância máxima controlam quem entra na busca. Cada
          oferta vale pelo tempo para aceitar: sem resposta, passa para o próximo motorista. Tentativas de despacho
          limita quantos motoristas são tentados (o operador também pode passar a vez em "Motorista não respondeu",
          em Corridas). Enquanto não há motorista, o sistema tenta de novo a cada poucos segundos; passado o tempo
          máximo de busca a corrida é cancelada e o cliente é avisado.
        </p>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Tempo para aceitar (s)"
              type="number"
              min="5"
              max="300"
              disabled={!canEdit}
              value={form.tempoOfertaSegundos}
              onChange={(e) => setForm({ ...form, tempoOfertaSegundos: Number(e.target.value) })}
            />
            <Input
              label="Tempo máximo de busca (min)"
              type="number"
              min="1"
              disabled={!canEdit}
              value={form.tempoEsperaMinutos}
              onChange={(e) => setForm({ ...form, tempoEsperaMinutos: Number(e.target.value) })}
            />
            <Input
              label="Distância máxima (km)"
              type="number"
              min="1"
              disabled={!canEdit}
              value={form.distanciaMaximaKm}
              onChange={(e) => setForm({ ...form, distanciaMaximaKm: Number(e.target.value) })}
            />
            <Input
              label="Tentativas de despacho"
              type="number"
              min="1"
              disabled={!canEdit}
              value={form.tentativasDespacho}
              onChange={(e) => setForm({ ...form, tentativasDespacho: Number(e.target.value) })}
            />
            <Input
              label="Raio de procura (km)"
              type="number"
              min="1"
              disabled={!canEdit}
              value={form.raioProcuraKm}
              onChange={(e) => setForm({ ...form, raioProcuraKm: Number(e.target.value) })}
            />
          </div>
          {canEdit && (
            <Button type="submit" disabled={saveMutation.isPending} className="mt-1">
              {saveMutation.isPending ? 'Salvando…' : saved ? 'Salvo ✓' : 'Salvar'}
            </Button>
          )}
        </form>
      </CardBody>
    </Card>
  );
}
