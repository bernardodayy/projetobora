-- O passageiro paga direto ao motorista (dinheiro, Pix na chave dele, cartão na máquina dele).
ALTER TABLE "Driver" ADD COLUMN "pixKey" TEXT,
ADD COLUMN "hasCardMachine" BOOLEAN NOT NULL DEFAULT false;
