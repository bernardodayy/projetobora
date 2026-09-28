-- Prazo da oferta ao motorista: passou dele sem resposta, a corrida é oferecida ao próximo.
ALTER TABLE "Ride" ADD COLUMN "offerExpiresAt" TIMESTAMP(3);
