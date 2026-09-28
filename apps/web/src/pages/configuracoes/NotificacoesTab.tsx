import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { api } from '../../lib/api';
import { useRealtimeEvent } from '../../lib/socket';
import { fetchPage, Paged } from '../../lib/paged';
import { Pagination } from '../../components/ui/Pagination';
import { Button } from '../../components/ui/Button';
import { Card, CardBody } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../features/auth/auth-context';
import { NotificacoesConfig, NotificationRow } from './types';

const NOTIFICATIONS_PAGE_SIZE = 20;

const SOURCE_LABEL: Record<'customer' | 'driver', string> = { customer: 'Cliente', driver: 'Motorista' };

const EMPTY: NotificacoesConfig = { push: false, email: false, sms: false, internas: true };

const CHANNEL_META: { key: keyof NotificacoesConfig; label: string; ready: boolean }[] = [
  { key: 'internas', label: 'Notificações internas (na Central)', ready: true },
  { key: 'push', label: 'Push (app do motorista/cliente)', ready: false },
  { key: 'email', label: 'E-mail', ready: false },
  { key: 'sms', label: 'SMS', ready: false },
];

export function NotificacoesTab() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('configuracoes.editar');
  const queryClient = useQueryClient();
  const [form, setForm] = useState<NotificacoesConfig>(EMPTY);

  const settingsQuery = useQuery<{ notificacoes: NotificacoesConfig }>({ queryKey: ['configuracoes'], queryFn: () => api.get('/configuracoes').then((r) => r.data) });
  const [page, setPage] = useState(1);
  const notificationsQuery = useQuery<Paged<NotificationRow>>({
    queryKey: ['notifications', page],
    queryFn: () => fetchPage('/notifications', {}, page, NOTIFICATIONS_PAGE_SIZE),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (settingsQuery.data) setForm(settingsQuery.data.notificacoes);
  }, [settingsQuery.data]);

  useRealtimeEvent('notification.created', () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  });

  const saveMutation = useMutation({
    mutationFn: (next: NotificacoesConfig) => api.patch('/configuracoes/notificacoes', next),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['configuracoes'] }),
  });

  const readMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const [replyOpenId, setReplyOpenId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const replyMutation = useMutation({
    mutationFn: ({ id, reply }: { id: string; reply: string }) => api.patch(`/notifications/${id}/reply`, { reply }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setReplyOpenId(null);
      setReplyDraft('');
    },
  });

  function toggle(key: keyof NotificacoesConfig) {
    const next = { ...form, [key]: !form[key] };
    setForm(next);
    saveMutation.mutate(next);
  }

  const notifications = notificationsQuery.data?.items ?? [];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
      <Card>
        <CardBody>
          <p className="mb-3 text-sm font-medium">Canais</p>
          {settingsQuery.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="flex flex-col gap-3">
              {CHANNEL_META.map((channel) => (
                <label key={channel.key} className="flex items-center justify-between gap-3 text-sm">
                  <span className={channel.ready ? '' : 'text-muted'}>
                    {channel.label}
                    {!channel.ready && <span className="ml-1.5 text-xs">(aguardando integração — Fase 6+)</span>}
                  </span>
                  <input type="checkbox" disabled={!canEdit || !channel.ready} checked={form[channel.key]} onChange={() => toggle(channel.key)} />
                </label>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <p className="mb-3 text-sm font-medium">Notificações internas recentes</p>
          {notificationsQuery.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : notifications.length === 0 ? (
            <EmptyState title="Nenhuma notificação ainda" description="Eventos como novo motorista pendente ou corrida cancelada aparecem aqui." />
          ) : (
            <ul className="flex flex-col gap-2">
              {notifications.map((n) => (
                <li key={n.id} className={`rounded-lg border border-border p-3 text-sm ${n.readAt ? 'opacity-60' : ''}`}>
                  <div className="flex items-start gap-3">
                    <Bell size={15} className="mt-0.5 shrink-0 text-brand" />
                    <div className="flex-1">
                      <p className="font-medium">
                        {n.title}
                        {n.sourceType && <span className="ml-2 text-xs font-normal text-muted">· {SOURCE_LABEL[n.sourceType]}</span>}
                      </p>
                      <p className="text-muted">{n.message}</p>
                      <p className="mt-1 text-xs text-muted">{new Date(n.createdAt).toLocaleString('pt-BR')}</p>
                    </div>
                    {!n.readAt && (
                      <Button variant="secondary" onClick={() => readMutation.mutate(n.id)} disabled={readMutation.isPending}>
                        Marcar como lida
                      </Button>
                    )}
                  </div>

                  {n.sourceType && (
                    <div className="mt-2 pl-6">
                      {n.reply ? (
                        <p className="rounded-md bg-surface-hover p-2 text-xs">
                          <span className="font-medium">Sua resposta:</span> {n.reply}
                        </p>
                      ) : replyOpenId === n.id ? (
                        <div className="flex gap-2">
                          <Input
                            className="flex-1"
                            placeholder="Escreva a resposta…"
                            value={replyDraft}
                            onChange={(e) => setReplyDraft(e.target.value)}
                          />
                          <Button
                            variant="secondary"
                            disabled={!replyDraft.trim() || replyMutation.isPending}
                            onClick={() => replyMutation.mutate({ id: n.id, reply: replyDraft.trim() })}
                          >
                            Enviar
                          </Button>
                        </div>
                      ) : (
                        <button className="text-xs font-medium text-brand" onClick={() => setReplyOpenId(n.id)}>
                          Responder
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
        <Pagination page={page} total={notificationsQuery.data?.total ?? 0} pageSize={NOTIFICATIONS_PAGE_SIZE} onChange={setPage} />
      </Card>
    </div>
  );
}
