import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchPage, Paged } from '../lib/paged';
import { Pagination } from '../components/ui/Pagination';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';

const AUDIT_PAGE_SIZE = 50;

interface AuditLogRow {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  createdAt: string;
  actor: { name: string; email: string } | null;
  actorType: 'admin' | 'customer' | 'driver' | null;
  actorLabel: string | null;
}

const ACTION_TONE: Record<string, 'success' | 'danger' | 'warning' | 'brand'> = {
  CREATE: 'success',
  DELETE: 'danger',
  UPDATE: 'warning',
  APPROVE: 'success',
  REJECT: 'danger',
};

const ACTOR_TYPE_LABEL: Record<'customer' | 'driver', string> = { customer: 'Cliente', driver: 'Motorista' };

// Admin tem FK de verdade (log.actor); cliente/motorista não têm — o nome foi
// capturado na hora da ação em actorLabel (ver AuditService.log). Sem
// actorType nenhum, a ação foi do sistema (cron, despacho automático etc.).
function actorDisplay(log: AuditLogRow): { name: string; typeLabel: string | null } {
  if (log.actor) return { name: log.actor.name, typeLabel: null };
  if (log.actorType === 'customer' || log.actorType === 'driver') {
    return { name: log.actorLabel ?? ACTOR_TYPE_LABEL[log.actorType], typeLabel: ACTOR_TYPE_LABEL[log.actorType] };
  }
  return { name: 'Sistema', typeLabel: null };
}

export function AuditPage() {
  const [page, setPage] = useState(1);
  const logsQuery = useQuery<Paged<AuditLogRow>>({
    queryKey: ['audit-logs', page],
    queryFn: () => fetchPage('/audit-logs', {}, page, AUDIT_PAGE_SIZE),
    placeholderData: keepPreviousData,
  });

  const logs = logsQuery.data?.items ?? [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Auditoria</h1>
        <p className="text-sm text-muted">Todas as ações administrativas sensíveis ficam registradas aqui.</p>
      </div>

      <Card>
        {logsQuery.isLoading ? (
          <div className="space-y-2 p-5">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <EmptyState title="Nenhuma ação registrada ainda" description="As alterações feitas na Central aparecerão aqui." />
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th className="px-5 py-3 font-medium">Data</th>
                <th className="px-5 py-3 font-medium">Autor</th>
                <th className="px-5 py-3 font-medium">Ação</th>
                <th className="px-5 py-3 font-medium">Entidade</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const actor = actorDisplay(log);
                return (
                  <tr key={log.id} className="border-b border-border last:border-0 hover:bg-surface-hover">
                    <td className="px-5 py-3 text-muted">{new Date(log.createdAt).toLocaleString('pt-BR')}</td>
                    <td className="px-5 py-3">
                      {actor.name}
                      {actor.typeLabel && <span className="ml-2 text-xs font-normal text-muted">· {actor.typeLabel}</span>}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={ACTION_TONE[log.action] ?? 'neutral'}>{log.action}</Badge>
                    </td>
                    <td className="px-5 py-3 text-muted">
                      {log.entity}
                      {log.entityId ? ` · ${log.entityId.slice(0, 8)}` : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <Pagination page={page} total={logsQuery.data?.total ?? 0} pageSize={AUDIT_PAGE_SIZE} onChange={setPage} />
      </Card>
    </div>
  );
}
