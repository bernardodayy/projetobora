// O app do motorista dá sinal de vida a cada 60 s enquanto está online (POST /driver-app/heartbeat);
// quem passa deste prazo sem sinal (app fechado, sem internet, celular desligado) não recebe mais
// oferta e é colocado offline sozinho (ver DriversService.expireStalePresence). Antes o motorista que
// só fechava o app ficava "disponível" pra sempre e absorvia ofertas que ninguém via.
export const PRESENCE_TIMEOUT_MS = 3 * 60_000;

export const presenceCutoff = () => new Date(Date.now() - PRESENCE_TIMEOUT_MS);
