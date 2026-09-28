import { io, Socket } from 'socket.io-client';
import { getAccessToken } from './api';

const SOCKET_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3333/api').replace(/\/api\/?$/, '');

let socket: Socket | null = null;

// Chamado depois do login/refresh, quando já existe um token para autenticar o
// handshake. O servidor coloca o motorista na sala própria dele e só emite
// eventos sem payload ('ride.updated', 'ride-message.created') — o app reage
// buscando os dados de novo (/rides/current, mensagens da corrida).
export function connectSocket(onRideUpdated: () => void, onRideMessage?: () => void): Socket {
  disconnectSocket();
  // auth como função: reavaliada a cada (re)conexão. Com o token fixo do momento em que o app abriu,
  // quem reabria o app depois de 15 min conectava com o token vencido, o servidor recusava e o tempo
  // real ficava morto até fechar o app (só o poll de 10 s segurava).
  socket = io(SOCKET_URL, { auth: (cb) => cb({ token: getAccessToken() }), autoConnect: true });
  // Recusa do servidor (token vencido) não reconecta sozinha no socket.io — tenta de novo com o token renovado.
  const current = socket;
  socket.on('disconnect', (reason) => {
    if (reason === 'io server disconnect') setTimeout(() => current === socket && current.connect(), 5000);
  });
  socket.on('ride.updated', onRideUpdated);
  if (onRideMessage) socket.on('ride-message.created', onRideMessage);
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
