import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { tokenStorage } from './api';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket) return socket;

  const url = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';
  socket = io(url, {
    // Função (não valor fixo): reavaliada a cada reconexão, senão depois de uma queda de rede
    // o socket reconecta com o token de acesso vencido e o servidor recusa.
    auth: (cb) => cb({ token: tokenStorage.getAccess() }),
    autoConnect: true,
  });
  return socket;
}

// Chamado no logout: sem isso o socket do usuário anterior continuava conectado (e na sala de admin).
export function resetSocket() {
  socket?.disconnect();
  socket = null;
}

export function useRealtimeEvent<T>(event: string, handler: (payload: T) => void) {
  useEffect(() => {
    const s = getSocket();
    s.on(event, handler);
    return () => {
      s.off(event, handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);
}
