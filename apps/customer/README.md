# App do cliente

App React Native (Expo) para o passageiro: pedir corrida, acompanhar o
motorista, cancelar e avaliar ao final. Consome a mesma API do painel
administrativo e do app do motorista, pela superfície dedicada
`/api/customer-app/*` (ver `docs/ARQUITETURA.md`).

Projeto standalone — fora dos workspaces npm do monorepo, mesmo motivo do
`apps/driver`: árvore de dependências do React Native não tem nada de útil
pra compartilhar com `apps/api`/`apps/web`.

## Rodando

```bash
cd apps/customer
npm install
npm run web     # http://localhost:8082 — mais rápido pra desenvolver
npm run ios     # simulador iOS via Expo Go
npm run android # emulador Android via Expo Go
```

Sem `apps/customer/.env`, usa `http://localhost:3333/api`. Para emulador
Android ou dispositivo físico, copie `.env.example` e ajuste
`EXPO_PUBLIC_API_URL`.

## Login

Clientes não têm cadastro próprio pelo app ainda — o admin define a senha
inicial pela Central: **Clientes → (cliente) → Senha do app do cliente**, ou
direto via API:

```bash
curl -X PATCH http://localhost:3333/api/customers/<id>/password \
  -H "Authorization: Bearer <token de admin>" \
  -H "Content-Type: application/json" \
  -d '{"password":"senha-do-cliente"}'
```

O login no app usa CPF (só dígitos) + essa senha.

## Escolha de destino

Sem integração com Google Places (decisão deliberada — evita depender de uma
API paga só para o autocomplete de endereço): o destino vem de endereços já
salvos do cliente (`CustomerAddress`) ou de marcar um ponto no mapa
arrastando até o pino central. Buscar por texto livre fica para quando essa
decisão for revista.
