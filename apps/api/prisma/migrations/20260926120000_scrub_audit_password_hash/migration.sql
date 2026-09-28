-- A auditoria guardava a linha inteira de Cliente/Motorista, incluindo o hash da senha.
-- O AuditService agora remove esse campo antes de gravar; aqui limpa o que já estava salvo.
UPDATE "AuditLog" SET "before" = "before" - 'passwordHash' WHERE "before" ? 'passwordHash';
UPDATE "AuditLog" SET "after" = "after" - 'passwordHash' WHERE "after" ? 'passwordHash';
