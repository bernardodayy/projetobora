# App do motorista

App React Native (Expo) para o motorista: ficar online/offline, receber a
corrida que o despacho automático atribuiu, aceitar ou recusar, e avançar o
trajeto até finalizar. Consome a mesma API do painel administrativo, pela
superfície dedicada `/api/driver-app/*` (auth e permissões próprias, ver
`docs/ARQUITETURA.md` seção 8).

Projeto standalone — fora dos workspaces npm do monorepo (React Native tem
uma árvore de dependências própria, sem nada de útil pra compartilhar hoje
com `apps/api`/`apps/web`).

## Rodando

```bash
cd apps/driver
npm install
npm run web     # http://localhost:8081 — mais rápido pra desenvolver
npm run ios     # simulador iOS via Expo Go
npm run android # emulador Android via Expo Go
```

Sem `apps/driver/.env`, usa `http://localhost:3333/api` (funciona direto no
simulador iOS e no target web). Para emulador Android ou dispositivo físico,
copie `.env.example` e ajuste `EXPO_PUBLIC_API_URL`.

## Login

Motoristas não têm cadastro próprio ainda — o admin define a senha inicial
pela Central: **Motoristas → (motorista) → placeholder de senha** ou direto
via API:

```bash
curl -X PATCH http://localhost:3333/api/drivers/<id>/password \
  -H "Authorization: Bearer <token de admin>" \
  -H "Content-Type: application/json" \
  -d '{"password":"senha-do-motorista"}'
```

O login no app usa CPF (só dígitos) + essa senha.
