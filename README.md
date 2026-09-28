# Central de Controle

Plataforma própria de gestão de mobilidade urbana, para substituir a
plataforma de terceiros atualmente usada pela operação. O produto é
propositalmente **white-label**: nome, cor da marca e logo são configuráveis
em Configurações → Sistema e se aplicam ao vivo em toda a Central (incluindo
a tela de login, antes mesmo do usuário entrar) — nada disso é hardcoded no
código.

Este repositório contém as **8 fases do roadmap** completas: da fundação
(auth, RBAC, auditoria) até o motor de tarifas, o financeiro automático,
configurações, despacho automático de motoristas, o app do motorista
(`apps/driver`) e o app do cliente (`apps/customer`) — o ciclo completo de
pedir, aceitar, acompanhar e avaliar uma corrida já roda de ponta a ponta
sem nenhuma tela do admin no meio.

Identidade visual, nomenclaturas e componentes são originais — nada aqui
foi copiado de plataformas concorrentes.

## Stack e por quê

| Camada | Escolha | Motivo |
|---|---|---|
| Backend | NestJS + TypeScript | DI e guards nativos mapeiam direto para RBAC granular (seção 18 do briefing); estrutura modular evita "arquivo gigante". |
| ORM / banco | Prisma + PostgreSQL | Migrations versionadas, tipos gerados a partir do schema, `Decimal`/`Json` nativos para tarifas e geometria de zonas. |
| Auth | JWT de acesso (15 min) + refresh token rotativo em tabela própria | Permissões vão embutidas no access token (checagem sem round-trip ao banco a cada request); revogação via refresh token na tabela `RefreshToken`. |
| Frontend | React + TypeScript + Vite + Tailwind | Build rápido, sem lock-in de framework; Tailwind com tokens de tema (`--color-*`) para claro/escuro. |
| Apps de motorista e cliente | Expo + React Native + TypeScript | Mesma linguagem/paradigma do painel web; rodam em iOS, Android e web (`expo start --web`) a partir do mesmo código. |
| Estado de servidor | TanStack Query | Cache, revalidação e loading/error state sem Redux. |
| Ícones | lucide-react | Set consistente, sem depender de assets de terceiros. |
| Monorepo | npm workspaces (`apps/api`, `apps/web`) | Dois apps só; Turborepo/Nx seriam overhead nesta fase — reavaliar se o build ficar lento. `apps/driver` e `apps/customer` ficam de fora de propósito (ver seções abaixo). |
| Infra local | Docker Compose (Postgres + Redis) | Redis já provisionado para quando o despacho em tempo real (Fase 3) precisar dele; nada o usa ainda. |

Decisões documentadas com mais detalhe em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

## Rodando localmente

### 1. Banco de dados

Com Docker:

```bash
docker compose up -d postgres redis
```

Sem Docker (Postgres.app, Homebrew, etc.), só aponte `DATABASE_URL` no
`.env` para a sua instância local.

### 2. Backend

```bash
cd apps/api
cp .env.example .env   # ajuste DATABASE_URL e os segredos JWT
npm install
npm run db:migrate     # cria as tabelas
npm run db:seed        # cria permissões, cargos padrão e o admin inicial
npm run dev             # http://localhost:3333/api
```

O seed imprime o e-mail/senha do administrador inicial (também definidos em
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` no `.env`). **Troque essa senha
antes de qualquer uso real.**

### 3. Frontend

```bash
cd apps/web
cp .env.example .env
npm install
npm run dev             # http://localhost:5173
```

### 4. App do motorista (opcional)

```bash
cd apps/driver
npm install
npm run web              # http://localhost:8081 — mais rápido pra desenvolver
npm run ios / npm run android
```

Projeto standalone (fora dos workspaces do passo 2/3) — detalhes de login
em [`apps/driver/README.md`](apps/driver/README.md).

### 5. App do cliente (opcional)

```bash
cd apps/customer
npm install
npm run web              # http://localhost:8082 — mais rápido pra desenvolver
npm run ios / npm run android
```

Também standalone — detalhes de login e da escolha de destino sem Google
Places em [`apps/customer/README.md`](apps/customer/README.md).

### 6. Testes do backend

```bash
cd apps/api
npm test
```

## O que já existe (Fase 1 a 8)

- Login, refresh token rotativo, logout.
- RBAC completo: cargos, permissões granulares (`modulo.acao`), tela de
  gestão de usuários administrativos e de cargos/permissões.
- Auditoria: toda criação/edição/exclusão/aprovação/bloqueio grava
  `AuditLog` (ator, ação, entidade, antes/depois) e é visível em
  **Auditoria** na Central.
- Modelo de dados completo do domínio (clientes, motoristas, veículos,
  corridas, precificação, zonas, financeiro, notificações) já migrado no
  banco, pronto para as próximas fases — só ainda não tem tela nem regra de
  negócio para o que ainda não foi implementado.
- **Clientes**: cadastro, filtros (nome/CPF/status), ficha com dados
  pessoais, endereços e bloqueio/desbloqueio com motivo auditado. Histórico
  de corridas aparece como "Fase 3" — sem dado simulado.
- **Motoristas**: um único item de navegação com abas internas — **Todos**
  (cadastro/edição, veículo, bloqueio), **Aprovação** (fila de pendentes com
  aprovar/reprovar/solicitar correção) e **Bloqueados** (motivo, responsável,
  desbloqueio). Novos motoristas sempre entram como pendentes, espelhando o
  fluxo real de solicitação de cadastro.
- **Corridas**: registro manual (enquanto não existe app do cliente), com
  **despacho automático de verdade**: toda corrida criada sem motorista
  definido já busca sozinha o motorista aprovado, disponível e mais próximo
  (raio de procura → distância máxima, ambos configuráveis em
  Configurações → Despacho), marca-o `BUSY` para não ser oferecido a outra
  corrida em paralelo, e libera-o de novo ao concluir/cancelar. Sem app do
  motorista ainda para ele aceitar ou recusar, "Motorista não respondeu" em
  Corridas deixa o operador redespachar para o próximo mais próximo em nome
  dele — até o limite de tentativas configurado; esgotado, cai para
  atribuição manual com notificação interna. Avanço de status com máquina de
  estados validada no servidor (`REQUESTED → SEARCHING_DRIVER →
  DRIVER_ASSIGNED → DRIVER_EN_ROUTE → PASSENGER_ABOARD → IN_PROGRESS →
  COMPLETED`, cancelável a qualquer momento antes de concluir), histórico
  completo por corrida (`RideEvent`, com a origem — manual ou automática — de
  cada atribuição) e atualização em tempo real via WebSocket.
- **Planejamento**: visão das corridas com agendamento futuro
  (`scheduledAt`), reaproveitando o mesmo motor de Corridas.
- **Mapa operacional**: motoristas aprovados plotados no Google Maps,
  coloridos por disponibilidade, com painel de detalhes ao clicar e filtro
  por status; atualiza sozinho via WebSocket quando a localização ou o
  status de um motorista muda. Sem chave do Google Maps configurada, mostra
  um aviso claro em vez de simular o mapa.
- WebSocket (Socket.io) autenticado por JWT, com eventos `ride.updated` e
  `driver.updated` — a mesma infraestrutura que o despacho em tempo real
  (Fase 8, apps de cliente/motorista) vai usar.
- **Tarifas**: configuração da fórmula base (tarifa base, valor/km,
  valor/minuto, tarifa mínima) com histórico de alterações auditado;
  horários com multiplicador próprio (inclusive janelas que cruzam a
  meia-noite); simulador que mostra o cálculo passo a passo, exatamente
  como pedido no briefing.
- **Áreas de preço**: zonas circulares ou poligonais com prioridade,
  vigência (dias/horário/data) e regras próprias (multiplicador, valor
  fixo, ou sobrescrita de tarifa base/km/minuto). O motor decide qual zona
  e qual horário se aplicam e como combiná-los conforme a **estratégia de
  combinação** escolhida (maior multiplicador, multiplicação, prioridade da
  zona, prioridade do horário, ou valor fixo da zona) — nunca multiplica
  tudo às cegas.
- Toda corrida criada agora recebe o preço calculado automaticamente pelo
  mesmo motor do simulador (`distanceKm`, `durationMin`, `finalPrice` e o
  detalhamento completo ficam gravados em `Ride.pricingBreakdown`, imutáveis
  depois de calculados). Sem uma chave do Google Maps configurada, a
  distância é estimada por linha reta com um fator de correção — documentado
  em `docs/ARQUITETURA.md`, nunca escondido.
- **Financeiro**: toda corrida finalizada com motorista gera automaticamente
  3 lançamentos (`FinancialTransaction`) — pagamento da corrida, taxa da
  plataforma e repasse ao motorista, calculados pela comissão configurável
  (editável só por quem tem `configuracoes.editar`, já que é política do
  sistema, não dado transacional). Painel com faturamento, taxas, repasses
  pendentes/pagos e corridas canceladas, filtráveis por período/motorista/
  cliente/forma de pagamento, gráfico de faturamento por dia, e ação para
  confirmar repasse ("Marcar como pago") — tudo auditado.
- **Configurações**: dados da empresa (nome/telefone/e-mail), identidade
  visual (cor da marca com seletor nativo + URL de logo, com
  pré-visualização ao vivo), parâmetros de despacho automático (raio de
  procura, distância máxima e tentativas já valem de verdade em toda corrida
  nova — ver Corridas; tempo de espera é só informativo até existir app do
  motorista para confirmar), canais de notificação (internas já
  funcionam; push/e-mail/SMS aparecem claramente como "aguardando
  integração"), e um painel de status de integrações que lê o ambiente do
  servidor (nunca expõe a chave em si) para dizer o que está configurado.
- **Notificações internas**: motorista novo aguardando aprovação e corrida
  cancelada já geram notificação de verdade (não é só uma tela de
  configuração vazia) — visível em Configurações → Notificações, ao vivo
  via WebSocket, com "marcar como lida".
- Todos os módulos do briefing (seção 1) estão implementados — não sobrou
  nenhum item "Fase N" na navegação.
- **White-label de verdade, não só no papel**: nome, cor da marca e logo
  definidos em Configurações → Sistema se aplicam **ao vivo**, em toda a
  Central — inclusive na tela de login, antes de qualquer autenticação,
  via um endpoint público (`GET /branding`) que só expõe o que é seguro
  mostrar publicamente. A cor troca instantaneamente sem recarregar a
  página (sobrescreve as variáveis CSS do tema); o nome muda até no título
  da aba do navegador. Ver `apps/web/src/features/branding/`.
- **Polimento (Fase 7)**: 44 testes de backend (autenticação, permissões,
  cálculo de tarifa, zonas, horários, corridas, bloqueios), modal acessível
  (`Escape` fecha, foco inicial, `role="dialog"`), link "pular para o
  conteúdo", `aria-label`/`aria-pressed` nos controles que só tinham ícone,
  e code-splitting por página — o bundle inicial caiu de ~570 KB para
  ~274 KB (o mapa e o socket só carregam quando a página é aberta). No
  processo, corrigi dois bugs reais de loop infinito de requisição
  (Financeiro e Dashboard recalculavam a data a cada render) e um card do
  Dashboard que ainda dizia "Financeiro (Fase 5)" depois da Fase 5 pronta.
- **App do motorista** (`apps/driver`, Expo/React Native), com quatro
  abas — **Início**: login por CPF + senha (definida pelo admin em
  Motoristas), ficar online/offline, receber a corrida que o despacho
  automático atribuiu em tempo real (sala própria no WebSocket, sem
  depender de polling), aceitar/recusar, e avançar o trajeto até
  finalizar — reaproveitando as mesmas regras de negócio (`RidesService`)
  que o painel admin usa, nunca uma cópia. Durante a corrida: ligar de
  verdade para o passageiro, navegar pelo mapa nativo do aparelho, enviar
  observação para a central (vira notificação interna), e avaliar o
  passageiro de 1 a 5 ao concluir. **Programadas**: corridas agendadas já
  atribuídas a este motorista (despacho automático perto do horário ou
  atribuição manual da central). **Atividade**: no topo, Ganhos — quanto
  tem a receber e já recebeu, reaproveitando o mesmo `FinanceiroService`
  que o financeiro do admin usa, só filtrado pelo motorista logado; abaixo,
  o histórico de corridas. **Conta**: perfil, troca de senha autoatendida
  (com senha atual) e "Fale conosco" fora do contexto de uma corrida.
  Mesma marca (nome/cor/logo) do painel, via `/branding`. Ver
  `docs/ARQUITETURA.md` seção 5-F.
- **App do cliente** (`apps/customer`, Expo/React Native), com três abas —
  **Início**: login por CPF + senha (definida pelo admin em Clientes),
  pedir corrida a partir de um endereço salvo, buscando por texto (geocoder
  nativo do aparelho, sem Google Places — decisão deliberada, ver seção
  5-G) ou marcando um ponto no mapa — os três caminhos terminam numa
  descrição de endereço editável, então dá pra corrigir um número errado
  antes de confirmar, tanto no destino quanto ajustando a origem; aplicar
  cupom de desconto (validado no preview e de novo ao confirmar), agendar
  a corrida para daqui a pouco em vez de pedir na hora, ver o motorista
  designado e o preço estimado antes de confirmar, acompanhar a corrida em
  tempo real, ligar para o motorista, cancelar, e avaliá-lo ao final —
  podendo marcá-lo como favorito no mesmo passo. **Atividade**: histórico
  de todas as corridas do cliente, incluindo as agendadas ainda não
  despachadas. **Conta**: dados do perfil, meus endereços (adicionar,
  editar e remover locais salvos como "Casa"/"Trabalho", mesma busca/mapa
  do pedido de corrida), carteira (saldo + recarga simulada + extrato —
  sem gateway de pagamento real, mesma honestidade já usada em
  `Ride.paymentMethod`), cartões salvos (guarda só bandeira + últimos 4
  dígitos como rótulo de exibição — nunca número completo nem CVV),
  motoristas favoritos, troca de senha autoatendida (com senha atual),
  "Fale conosco" (vira notificação interna para a central) e sair. Fecha o
  mesmo ciclo do app do motorista, do outro lado. Ver
  `docs/ARQUITETURA.md` seção 5-G.
- **Preparação para os apps (Fase 8)**: o que ficou só documentado virou
  código — motorista e cliente, cada um com seu app funcionando de ponta
  a ponta contra a mesma API, incluindo cupom, carteira, cartão salvo,
  corrida agendada e motorista favorito (pedidos explicitamente para
  comparar com apps de mercado). Chat de verdade entre os dois (em vez de
  ligação + observação pra central), bloqueio de motorista pelo cliente,
  histórico de ganhos e qualquer forma de pagamento processado de
  verdade continuam fora de escopo — deliberado, não por falta de app do
  outro lado.

## Roadmap

1. **Fase 1 — Fundação** ✅: auth, RBAC, auditoria, modelo de dados, casca da Central.
2. **Fase 2 — Pessoas** ✅: Clientes, Motoristas, fila de aprovação, motoristas bloqueados.
3. **Fase 3 — Operação** ✅: Corridas, Mapa operacional (Google Maps), planejamento, WebSockets para tempo real.
4. **Fase 4 — Precificação** ✅: tarifas, zonas de preço, horários, estratégia de combinação, simulador de corrida.
5. **Fase 5 — Financeiro** ✅: faturamento, repasses, taxas da plataforma, relatórios.
6. **Fase 6 — Configurações e integrações** ✅: dados da empresa, despacho, notificações, status de integrações.
7. **Fase 7 — Testes e polimento** ✅: cobertura de regras de preço/permissões/zonas/horários, acessibilidade do modal e dos controles, code-splitting.
8. **Fase 8 — Preparação para os apps** ✅ (este repositório, documentação): decisões pendentes e plano de extensão em `docs/ARQUITETURA.md` — a API já é desenhada para atender múltiplos consumidores.

Com isso, o roadmap completo do briefing está entregue.

## Segurança

- Senhas com bcrypt (10 rounds).
- Access token de curta duração; refresh token de alta entropia, armazenado
  como hash SHA-256 (nunca em texto puro) e revogável.
- `class-validator` com `whitelist`/`forbidNonWhitelisted` em todo payload.
- Nenhuma credencial no código — tudo via `.env` (`.env` está no
  `.gitignore`; só os `.env.example` são versionados).
- Admin e motorista têm autenticação paralela (JWTs, refresh tokens e
  guards separados) assinados com o mesmo segredo — um discriminador
  (`type: 'admin' | 'driver'`) no payload garante que o token de um não é
  aceito onde o do outro é esperado.
- `ponytail:` no código marca simplificações deliberadas desta fase (ex.:
  tokens em `localStorage` em vez de cookie httpOnly) com o caminho de
  evolução — ver `docs/ARQUITETURA.md`.
