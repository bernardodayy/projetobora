-- Presença do motorista: o despacho só oferece corrida a quem deu sinal recentemente.
ALTER TABLE "Driver" ADD COLUMN "lastSeenAt" TIMESTAMP(3);
