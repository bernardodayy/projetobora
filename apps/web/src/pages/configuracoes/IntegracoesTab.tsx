import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { Card, CardBody } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { IntegrationsStatus } from './types';

const INTEGRATIONS: { key: keyof IntegrationsStatus; label: string; description: string }[] = [
  { key: 'googleMaps', label: 'Google Maps', description: 'Mapa operacional, distância/tempo de corrida e desenho de zonas. Chave em GOOGLE_MAPS_API_KEY / VITE_GOOGLE_MAPS_API_KEY.' },
  { key: 'gatewayPagamento', label: 'Gateway de pagamento', description: 'Cobrança automática de corridas e repasse a motoristas. Ainda não integrado — Financeiro registra os valores manualmente.' },
  { key: 'servicoMensagens', label: 'Serviço de mensagens (SMS)', description: 'Envio de SMS para clientes e motoristas. Ainda não integrado.' },
  { key: 'firebase', label: 'Firebase (push)', description: 'Notificações push para os apps de cliente e motorista (Fase 8). Ainda não integrado.' },
];

export function IntegracoesTab() {
  const query = useQuery<IntegrationsStatus>({ queryKey: ['configuracoes-integracoes'], queryFn: () => api.get('/configuracoes/integracoes').then((r) => r.data) });

  if (query.isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {INTEGRATIONS.map((integration) => {
        const active = query.data?.[integration.key] ?? false;
        return (
          <Card key={integration.key}>
            <CardBody className="flex items-start gap-3">
              {active ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-success" /> : <XCircle size={18} className="mt-0.5 shrink-0 text-muted" />}
              <div>
                <p className="font-medium">{integration.label}</p>
                <p className="text-xs text-muted">{integration.description}</p>
                <p className={`mt-1 text-xs font-medium ${active ? 'text-success' : 'text-muted'}`}>{active ? 'Configurado' : 'Não configurado'}</p>
              </div>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
