import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { api } from '../../lib/api';
import { useRealtimeEvent } from '../../lib/socket';
import { useAuth } from '../auth/auth-context';
import { NotificationRow } from '../../pages/configuracoes/types';

const BASE_TITLE = 'Central de Controle';

// Onde resolver cada tipo de aviso. Fale conosco (tem `sourceType`) se responde na aba de notificações;
// o resto vai para a tela do assunto. Os títulos vêm da API (RidesService/DriversService).
function destinationFor(n: NotificationRow): string {
  if (n.sourceType) return '/configuracoes/notificacoes';
  if (n.title.startsWith('Novo motorista')) return '/motoristas/aprovacao';
  if (n.title.startsWith('Corrida') || n.title.startsWith('Despacho') || n.title.startsWith('Mensagem de')) return '/corridas';
  return '/configuracoes/notificacoes';
}

function timeAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return new Date(iso).toLocaleDateString('pt-BR');
}

// Sino no topo da Central: quantidade de avisos não lidos (Fale conosco, corrida cancelada, motorista
// novo, despacho sem motorista…) e os mais recentes num painel — antes só existiam dentro de
// Configurações → Notificações, então ninguém via a mensagem de um cliente chegar.
export function NotificationBell() {
  const { hasPermission } = useAuth();
  const canSee = hasPermission('dashboard.visualizar');
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  const countQuery = useQuery<{ count: number }>({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => api.get('/notifications/unread-count').then((r) => r.data),
    enabled: canSee,
    refetchInterval: 60_000,
  });
  const listQuery = useQuery<NotificationRow[]>({
    queryKey: ['notifications', 'bell'],
    queryFn: () => api.get('/notifications', { params: { unread: true, pageSize: 8 } }).then((r) => r.data),
    enabled: canSee && open,
  });

  // Aviso novo chegou (ou foi lido em outra tela): tudo que mostra notificação se atualiza.
  useRealtimeEvent('notification.created', () => queryClient.invalidateQueries({ queryKey: ['notifications'] }));

  const readMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const readAllMutation = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const count = countQuery.data?.count ?? 0;

  // Contagem também na aba do navegador: dá pra ver que chegou coisa sem estar com a Central em foco.
  useEffect(() => {
    document.title = count > 0 ? `(${count > 99 ? '99+' : count}) ${BASE_TITLE}` : BASE_TITLE;
    return () => {
      document.title = BASE_TITLE;
    };
  }, [count]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!container.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!canSee) return null;

  const items = listQuery.data ?? [];

  // O painel é `fixed` (e não absoluto ao sino): assim não passa da borda de janelas estreitas.
  return (
    <div ref={container} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={count > 0 ? `Notificações (${count} não lidas)` : 'Notificações'}
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-hover hover:text-ink"
      >
        <Bell size={18} />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-[18px] text-white">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed left-3 top-[4.25rem] z-50 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">Notificações</p>
            {count > 0 && (
              <button
                onClick={() => readAllMutation.mutate()}
                disabled={readAllMutation.isPending}
                className="text-xs font-medium text-brand hover:underline disabled:opacity-50"
              >
                Marcar todas como lidas
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {listQuery.isLoading ? (
              <p className="px-4 py-6 text-center text-sm text-muted">Carregando…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">Nenhuma notificação nova.</p>
            ) : (
              <ul>
                {items.map((n) => (
                  <li key={n.id} className="border-b border-border last:border-0">
                    <button
                      onClick={() => {
                        readMutation.mutate(n.id);
                        setOpen(false);
                        navigate(destinationFor(n));
                      }}
                      className="block w-full px-4 py-3 text-left hover:bg-surface-hover"
                    >
                      <p className="text-sm font-medium">{n.title}</p>
                      <p className="line-clamp-2 text-xs text-muted">{n.message}</p>
                      <p className="mt-1 text-[11px] text-muted">{timeAgo(n.createdAt)}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            onClick={() => {
              setOpen(false);
              navigate('/configuracoes/notificacoes');
            }}
            className="block w-full border-t border-border px-4 py-2.5 text-center text-xs font-medium text-brand hover:bg-surface-hover"
          >
            Ver todas
          </button>
        </div>
      )}
    </div>
  );
}
