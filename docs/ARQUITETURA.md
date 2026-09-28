# Arquitetura — Central de Controle

## 1. Visão geral

```
apps/web  (React + Vite)  ──HTTPS/JSON──▶  apps/api (NestJS)  ──▶  PostgreSQL
                                                 │
                                                 └──▶  Redis (reservado, Fase 3+)
```

A API é a única porta de entrada para dados — a Central Web é um cliente
como outro qualquer. Isso é deliberado: os apps de cliente e motorista
(Fase 8) vão consumir os mesmos endpoints, só que com escopos de permissão
diferentes (um `AdminUser` nunca é a mesma entidade que um `Customer` ou
`Driver`, então não há risco de um passageiro herdar permissão
administrativa).

## 2. RBAC

- `Permission` é um catálogo fixo de strings `modulo.acao` (ex.:
  `zonas.criar`), seedado uma vez (`prisma/seed.ts`). Não é editável pela UI
  porque representa pontos de extensão do código, não dado de negócio — uma
  permissão só existe se algum guard no backend realmente a checa.
- `Role` é dado de negócio, editável pela Central. Cargos "de sistema"
  (`isSystem = true`, os três do briefing: Master/Operador/Financeiro) não
  podem ser excluídos, mas suas permissões podem ser ajustadas — evita que
  alguém apague sem querer o único cargo com acesso total.
- O access token carrega a lista de permissões do usuário no momento do
  login/refresh. **Trade-off assumido:** se um admin muda o cargo de um
  usuário logado, o efeito só aparece no próximo refresh (até 15 min, ou no
  próximo login). Alternativa seria checar permissões no banco a cada
  request — mais correto em tempo real, mais lento. Ajustável depois se
  virar problema real.

## 3. Auditoria

`AuditLog` grava `actor`, `action`, `entity`, `entityId`, `before`, `after`.
Por ora é chamado explicitamente em cada service (`UsersService`,
`RolesService`) em vez de um interceptor global automático — um interceptor
genérico não sabe o que é "antes" de forma confiável sem já ter carregado o
registro, e cada entidade tem campos sensíveis diferentes (não queremos
logar hash de senha, por exemplo). Quando `DriverBlock`, `Ride` etc.
ganharem services na Fase 2/3, eles chamam o mesmo `AuditService.log()`.

## 4. Precificação

- `PricingConfiguration`: tarifa base, valor/km, valor/minuto, tarifa
  mínima — configurável, nunca hardcoded. Editar qualquer campo gera uma
  linha em `PricingConfigurationHistory` (campo, valor anterior, valor
  novo, quem alterou), exigido pelo briefing ("nunca alterar tarifa
  importante sem manter histórico").
- `PricingZone`: polígono ou círculo (`geometry` como `{points:[{lat,lng}]}`
  ou `{center:{lat,lng}, radiusMeters}`), multiplicador **ou** valor fixo,
  e pode sobrescrever tarifa base/km/minuto/mínima só dentro dela. Tem
  janela de dias/horário e vigência (`startDate`/`endDate`) próprias, além
  de `priority` (maior número vence quando duas zonas se sobrepõem).
- `PricingSchedule`: regras por horário/dia da semana, com sua própria
  prioridade — testado explicitamente para janelas que cruzam a meia-noite
  (ex.: 18:00–00:00 e 00:00–06:00), o caso que mais gente erra nesse tipo
  de regra.
- `PricingConfiguration.combinationStrategy` (`HIGHEST_MULTIPLIER`,
  `MULTIPLY_ALL`, `ZONE_PRIORITY`, `SCHEDULE_PRIORITY`, `ZONE_FIXED_VALUE`)
  decide como zona + horário se combinam — nunca multiplica tudo às cegas.
  `PricingEngineService.calculate()` (`apps/api/src/pricing/`) é o único
  lugar que aplica essa regra; o simulador e a criação de corrida chamam o
  mesmo método, então nunca divergem.
- Detecção de zona usa geometria plana (ray casting para polígono,
  Haversine para círculo) — suficiente para zonas de cidade, sem precisar
  de PostGIS nesta escala (ver riscos técnicos).
- Distância/duração: com `GOOGLE_MAPS_API_KEY` configurada, usa a
  Distance Matrix API; sem chave, estima por linha reta × 1,3 (fator de
  sinuosidade de ruas) a 25 km/h médios — aproximação documentada
  (`DistanceService`), nunca escondida do usuário (o simulador mostra
  "(estimada)" quando é o caso).
- `Ride.pricingBreakdown` (JSON) + os campos individuais (`distanceKm`,
  `finalPrice` etc.) são calculados uma vez na criação da corrida e
  congelados — não recalculam se a configuração mudar depois, para o preço
  cobrado nunca mudar retroativamente.

## 5. Mapa, tempo real e despacho (Fase 3)

- **Google Maps**: `VITE_GOOGLE_MAPS_API_KEY` fica em `apps/web/.env`, nunca
  no código. Sem chave configurada, `MapaOperacionalPage` mostra um aviso
  de configuração em vez de tentar carregar o SDK ou simular marcadores —
  zero custo de cota, zero tela quebrada.
- **WebSocket**: `RealtimeGateway` (Socket.io) autentica a conexão pelo
  mesmo JWT de acesso da API REST — não existe um segundo mecanismo de
  auth. Emite `ride.updated` e `driver.updated`; o frontend só invalida a
  query do React Query correspondente (`useRealtimeEvent`), sem estado
  paralelo para sincronizar. Os broadcasts globais vão só para a sala
  `admins` (ver 5-J) — cliente e motorista só recebem eventos sem payload
  nas salas próprias.
- **Localização do motorista**: como ainda não existe app do motorista
  enviando GPS de verdade, `PATCH /drivers/:id/location` é uma correção
  manual feita pelo admin (ex.: motorista avisou por telefone). Não há
  simulação de movimento — um motorista sem localização definida
  simplesmente não aparece no mapa, em vez de aparecer com coordenada
  inventada.
- **Corridas manuais**: sem app do cliente, `POST /rides` é como uma
  central telefônica registraria uma corrida hoje. O modelo de dados e os
  eventos (`RideEvent`) são os mesmos que o app vai usar depois — só muda
  quem dispara a criação.
- **Despacho automático**: implementado — ver seção 5-E. A previsão original
  era esperar um app do motorista para ter localização de verdade; na
  prática o mesmo `lastLat`/`lastLng` mantido manualmente já é suficiente
  para o motor de matching funcionar, então não fazia sentido represar essa
  parte.

## 5-B. Financeiro (Fase 5)

- **Geração automática de lançamentos**: `RidesService.advanceStatus()`
  chama `FinanceiroService.generateTransactionsForRide()` só quando o status
  vira `COMPLETED`, e só se a corrida tem `finalPrice` e motorista — uma
  corrida cancelada ou sem preço calculado não gera nenhuma transação
  financeira (nada de inventar valor). A checagem por transação já existente
  (`findFirst` por `rideId`+`RIDE_PAYMENT`) evita duplicar lançamentos se o
  método for chamado duas vezes.
- **Sem gateway de pagamento real** (fica para quando houver integração na
  Fase 6): `RIDE_PAYMENT` e `PLATFORM_FEE` nascem `COMPLETED` (representa
  "a corrida foi cobrada", não "o dinheiro já caiu na conta"); só
  `DRIVER_PAYOUT` nasce `PENDING`, porque repasse a motorista é o único elo
  dessa cadeia que ainda depende de uma ação humana (`POST
  /financeiro/transactions/:id/settle`, "Marcar como pago"). Isso também é
  o que dá sentido a "repasses pendentes" como métrica real, não decorativa.
- **Comissão da plataforma**: guardada em `SystemConfiguration` (chave
  `financeiro.comissaoPercentual`, default 20% se a linha não existir) em
  vez de criar uma tabela nova só para isso — é exatamente o tipo de
  configuração de sistema que esse modelo já existe para resolver.
  Editá-la pede `configuracoes.editar` (só Master), não `financeiro.editar`
  — o cargo Financeiro mexe com valores do dia a dia, não com a política
  de quanto a plataforma retém, e o briefing já restringe isso (seção 1).
- **Permissão nova**: `financeiro.editar` foi adicionada ao catálogo nesta
  fase (só para "Marcar como pago") — o catálogo original da Fase 1 previa
  isso: cada módulo ganha `.editar` quando a tela realmente precisa
  alterar dado, nunca antes.

## 5-C. Configurações e notificações internas (Fase 6)

- **Configurações por seção, não por campo**: ao contrário da comissão do
  Financeiro (uma chave, um valor), Configurações guarda cada seção
  (`sistema`, `despacho`, `notificacoes`) como um único registro JSON em
  `SystemConfiguration` (chave `configuracoes.<secao>`), com defaults
  aplicados em código quando a linha ainda não existe. Menos linhas no
  banco, e o formulário do frontend já bate 1:1 com o formato salvo.
- **Parâmetros de despacho sem efeito ainda**: tempo de espera, distância
  máxima, tentativas e raio de busca são exatamente os campos pedidos no
  briefing, mas nenhuma lógica os lê hoje — não existe despacho automático
  até ter um produtor real de localização (Fase 8). A tela avisa isso
  explicitamente, em vez de fingir que os valores já fazem alguma coisa.
- **Notificações internas são reais, não decorativas**: `NotificationsService`
  é chamado por `DriversService.create()` (motorista pendente) e
  `RidesService.cancel()` (corrida cancelada) — os dois únicos gatilhos do
  briefing (seção 30) que já correspondem a um evento que existe de
  verdade no sistema hoje. Push/e-mail/SMS ficam como toggles desabilitados
  com "aguardando integração", porque inventar um envio sem provedor por
  trás seria simular uma integração que não existe.
- **Status de integrações não guarda segredo nenhum**: `GET
  /configuracoes/integracoes` só responde `true`/`false` a partir de
  `ConfigService.get(...)` no servidor — a chave em si nunca trafega para
  o frontend, só a informação "está configurada ou não".
- **Branding white-label, antecipado da Fase 6**: `corPrimaria` e `logoUrl`
  entraram na seção `sistema`, e um controller novo sem guard nenhum
  (`GET /branding`, em `branding.controller.ts`) expõe só o subconjunto
  seguro de mostrar antes do login (nunca o resto de Configurações, que
  segue atrás de `configuracoes.visualizar`). No frontend, `BrandProvider`
  busca isso uma vez no boot e escreve direto nas variáveis CSS do tema
  (`--color-brand`/`--color-brand-hover`, em `rgb(R G B)` porque é o que o
  Tailwind espera) — por isso a cor troca em toda a Central sem precisar
  recarregar a página nem duplicar componentes por tela. O tom de hover é
  derivado clareando a cor escolhida (mistura com branco), não uma segunda
  cor pedida ao admin — funciona igual em claro e escuro sem precisar de
  lógica condicional por tema. Sem upload de arquivo (não há Object
  Storage integrado ainda), `logoUrl` aceita um link — documentado como
  provisório na própria tela, não escondido.
  Desenho próprio, sem se inspirar visualmente em nenhuma referência de
  mercado — nome, seletor de cor nativo do navegador e um cartão de
  pré-visualização simples, nada além do que o briefing pediu.
  **Atualização — marca só pelos desenvolvedores:** nome, cor e logo
  deixaram de ser editáveis pelo painel. A identidade é definida uma vez,
  antes do lançamento, por `BRAND_NAME`, `BRAND_PRIMARY_COLOR` e
  `BRAND_LOGO_URL` no `.env` da API (`SettingsService.getBranding()`); dono
  e admin só editam telefone e e-mail de suporte. Não é uma permissão de
  cargo (o Administrador Master teria todas): o caminho simplesmente não
  existe — `UpdateSistemaDto` não tem esses campos e, com
  `forbidNonWhitelisted`, enviar qualquer um deles dá 400; a tela mostra os
  valores somente leitura. `GET /branding` e os apps continuam iguais (o app
  só lê a marca ao abrir). Valor inválido no `.env` cai no padrão em vez de
  quebrar. **A Central não usa a marca:** o painel tem identidade própria e
  fixa ("Central de Controle", cor do tema em `styles/index.css`) e nunca
  acompanha `BRAND_*` — a marca vale só para os apps do cliente e do
  motorista. Por isso o `BrandProvider` (que aplicava a cor nas variáveis
  CSS e no título da aba) foi removido do painel; a tela Sistema só mostra a
  marca dos apps, somente leitura, para conferência. O parágrafo anterior
  ("troca em toda a Central") descreve o desenho original e não vale mais.
  **Aba "Marca dos apps" (só desenvolvedor):** para ajustar a marca sem mexer
  em arquivo do servidor existe `desenvolvedor/marca` (GET/PATCH, permissão
  `desenvolvedor.marca`) e a página `pages/desenvolvedor/MarcaPage.tsx`. O
  valor salvo vai para `SystemConfiguration` (`marca.apps`) e vale mais que
  `BRAND_*`. A permissão fica **fora** da lista do seed que alimenta o "ALL" do
  Administrador Master, o cargo `Desenvolvedor` (com `desenvolvedor.marca` e
  `dashboard.visualizar`) e a conta `SEED_DEV_EMAIL`/`SEED_DEV_PASSWORD` são
  criados no seed, e o servidor esconde/bloqueia tudo isso de dono e admin:
  a permissão some de `GET /roles/permissions`, o cargo de `GET /roles`, a
  conta de `GET /users`; criar/editar cargo com `desenvolvedor.*` e atribuir
  o cargo a um usuário dão 400 (`common/developer.ts` concentra as
  constantes). Para remover a aba: apagar `developer.controller.ts`,
  `update-marca.dto.ts`, `common/developer.ts`, `MarcaPage.tsx` (+ item de
  menu/rota), o trecho de dev do seed e os filtros nos serviços de Cargos e
  Usuários.

## 5-D. Apps de cliente e motorista (Fase 8)

Esta seção documentava, quando escrita, uma decisão deliberada de **não**
construir endpoints de app sem um app de verdade para testar contra —
exatamente o tipo de trabalho especulativo que a seção 35 do briefing pede
para evitar ("não invente integrações inexistentes"). O lado do motorista
saiu dessa categoria: o app existe agora (`apps/driver`, ver 5-F) e o
desenho abaixo foi implementado quase literalmente. O lado do cliente
continua bloqueado pela mesma decisão pendente de sempre.

**Já pronto, sem precisar mudar nada:**
- `Customer` e `Driver` são entidades próprias, sempre foram — nenhuma
  regra de negócio depende de `AdminUser`. `Ride.customerId`/`driverId`
  são chaves estrangeiras normais.
- Toda a API é REST sob `/api`, já pensada para múltiplos consumidores —
  o painel web é só mais um cliente HTTP, não um caso especial.
- O motor de tarifas, zonas e o `RealtimeGateway` não sabem quem é
  "admin" — só reagem a dados (localização, status de corrida).

**Motorista: decisão tomada, implementado (5-F).** Em vez de esperar por
OTP/SMS, a autenticação do motorista usa o mesmo padrão de senha já
existente para `AdminUser` (`passwordHash` + bcrypt) — reaproveita infra
que já existe, sem esperar por um provedor de SMS que ainda não está
integrado. O admin define a senha inicial (não há autocadastro), o que
também resolve o outro lado do problema: sem upload de documentos
integrado, o cadastro do motorista continua sendo mediado pelo admin de
qualquer forma, então a senha ser definida por ele no mesmo fluxo não
adiciona uma etapa nova.

**Cliente: decisão ainda pendente.** Mesmo raciocínio não se aplica
diretamente — um cliente final não tem uma "central" mediando o cadastro
dele, então senha-definida-pelo-admin não faz sentido aqui. Continua
esperando a decisão de OTP/SMS (ou outro método) do cliente do projeto.

**Como a arquitetura se estende para o app de cliente, seguindo o padrão
já validado pelo do motorista:**
- Um `CustomerJwtStrategy`/`CustomerJwtAuthGuard` novo, no mesmo molde de
  `DriverJwtStrategy`/`DriverJwtAuthGuard` (`apps/api/src/driver-app/`) —
  troca só o discriminador do payload (`type: 'customer'`) e a tabela de
  refresh token dedicada (mesmo padrão de `DriverRefreshToken`).
- Endpoints novos sob `/api/customer-app/*`, reaproveitando os `*Service`
  existentes (`RidesService.create`) com o mesmo tipo de checagem de posse
  que `DriverAppService.assertOwnRide` já faz.
- `RealtimeGateway` já ganhou salas por usuário quando o motorista
  precisou (`client.join('driver:'+id)`, ver 5-F) — a mesma extensão
  (`client.join('customer:'+id)`) atende o app de cliente sem mudar como
  os eventos são emitidos, só quem escuta.

## 5-E. Despacho automático de motoristas

- **Por que agora, e não só quando o app do motorista existir**: os
  parâmetros de despacho (raio de procura, distância máxima, tentativas,
  tempo de espera) já existiam em Configurações desde a Fase 6, mas
  inertes — nenhuma linha de código os lia. O motor de matching só depende
  de `Driver.lastLat/lastLng` e `availability`, que já são reais (mantidos
  manualmente pelo admin, seção 5); não havia razão para esperar o app só
  para ligar essa parte.
- **Algoritmo** (`RidesService.findNearestAvailableDriver`): candidatos são
  motoristas `APPROVED`, `AVAILABLE`, com localização conhecida; distância
  até a origem calculada por haversine (mesma função usada na precificação,
  `geometry.util.ts`). Filtra por raio de procura primeiro; se ninguém
  estiver dentro dele, tenta de novo até a distância máxima antes de desistir
  — a intenção do raio é "preferencial", a distância máxima é o limite
  absoluto.
- **Ciclo de vida de `availability`**: atribuir uma corrida (manual ou
  automática) marca o motorista `BUSY`; concluir ou cancelar a corrida
  libera de volta para `AVAILABLE`. Sem isso o mesmo motorista seria
  oferecido para duas corridas simultâneas — bug real que o despacho
  automático exporia imediatamente, mesmo a atribuição manual já tinha essa
  lacuna antes (corrigida junto).
- **Sem app do motorista, quem recusa é o operador**: um motorista de
  verdade aceitaria ou recusaria a corrida pelo próprio celular. Sem esse
  produtor de eventos, um temporizador automático no servidor não teria
  nada real para esperar — implementá-lo agora seria simular uma confirmação
  que não existe. Em vez disso, "Motorista não respondeu" (`POST
  /rides/:id/redispatch`) deixa o operador — hoje o intermediário real,
  por telefone — acionar a mesma lógica de matching em nome do motorista,
  excluindo quem já foi tentado (rastreado via `RideEvent.metadata.driverId`)
  e respeitando o limite de tentativas. Esgotado o limite ou sem mais
  candidatos, a corrida cai para atribuição manual com notificação interna.
  (Superado em 5-J.) `tempoEsperaMinutos` ficava sem aplicação automática por isso — é dado de
  configuração pronto para o dia em que o app do motorista puder de fato
  confirmar ou recusar sozinho, substituindo o operador nesse papel sem
  mudar a API.
- **(Superado — ver 5-J: hoje existe timer de oferta e retentativa.)** Sem timer no servidor (`setInterval`/cron) para expirar atribuições
  sozinho: ponytail — adicionar um agendador para expirar algo que ninguém
  confirmava seria complexidade sem consumidor real. Deixou de ser
  hipotético: o app do motorista (5-F) chama exatamente o mesmo
  `redispatch` que o operador usava, sozinho — nenhuma mudança na API foi
  necessária, só um segundo chamador com uma checagem de posse na frente
  (`DriverAppService.assertOwnRide`). O timer automático continua sem
  existir — quem decide "não vou pegar essa corrida" ainda é uma ação
  explícita (tocar em "Recusar" no app, ou o operador clicar "Motorista
  não respondeu"), não um relógio.

## 5-F. App do motorista

`apps/driver` — Expo + React Native + TypeScript, projeto standalone fora
dos workspaces npm do monorepo (árvore de dependências do React Native não
tem nada de útil pra compartilhar hoje com `apps/api`/`apps/web`, então
forçar um workspace só complicaria a configuração do Metro bundler para
ganho nenhum).

- **Autenticação paralela, não RBAC**: `apps/api/src/driver-app/` é um
  segundo par strategy/guard (`DriverJwtStrategy`/`DriverJwtAuthGuard`,
  registrados como `'driver-jwt'`) ao lado do `JwtStrategy`/`JwtAuthGuard`
  do admin — exatamente o desenho que a seção 5-D já previa antes de
  existir. Os dois assinam com o mesmo `JWT_ACCESS_SECRET`, então o payload
  carrega um discriminador (`type: 'admin' | 'driver'`) e cada strategy
  rejeita o token do outro tipo — sem isso, um token de motorista
  decodificaria com sucesso no guard do admin e quebraria ao tentar ler
  `permissions` (que só existe no payload de admin).
- **Refresh token em tabela própria** (`DriverRefreshToken`, não
  `RefreshToken`): a tabela do admin tem uma FK para `AdminUser`, não dá
  para reaproveitar para motoristas sem quebrar essa constraint. Mesmo
  padrão (hash SHA-256, rotativo, revogável), tabela separada.
- **Senha definida pelo admin, não autocadastro**: motorista ainda entra
  no sistema via `POST /drivers` feito pelo admin (seção 5-D) — sem app
  próprio de cadastro nem verificação de documento automatizada, não faria
  sentido um fluxo de "criar minha própria senha" sem essa etapa antes.
  `PATCH /drivers/:id/password` (tela **Motoristas → editar → Senha do
  app do motorista**) deixa o admin definir/resetar; o motorista loga com
  CPF + essa senha.
- **Ações reaproveitam os services do admin, não duplicam regra de
  negócio**: `DriverAppService` é fino — `acceptRide`/`declineRide`/
  `advanceRide` chamam `RidesService.advanceStatus`/`redispatch` direto,
  as mesmas máquinas de estado e efeitos colaterais (financeiro,
  auditoria, liberar motorista) do fluxo do admin. A única coisa que
  `DriverAppService` adiciona é `assertOwnRide`: confirma que
  `ride.driverId` é o motorista do token antes de deixar a ação passar —
  sem isso, qualquer motorista logado poderia aceitar/avançar a corrida de
  qualquer outro.
- **Tempo real por sala, não broadcast global**: motoristas entram numa
  sala Socket.io própria (`driver:<id>`) na conexão — `RealtimeGateway`
  decodifica o token do handshake e só coloca quem tem `type: 'driver'`
  numa sala. O evento emitido é `ride.updated` sem payload; o app só reage
  buscando `/driver-app/rides/current` de novo. Isso existe por privacidade
  (o broadcast global do admin carrega corridas de outros clientes — um
  motorista nunca deveria receber isso) e não por escala.
- **Localização em primeiro plano, sem serviço em segundo plano**:
  `expo-location` com `watchPositionAsync` só roda enquanto o app está
  aberto e o motorista está online — `ponytail`, localização em segundo
  plano é permissão adicional (iOS exige justificativa própria pra App
  Store) sem um caso de uso que a justifique ainda.
- **Branding compartilhado**: o app consome o mesmo `GET /branding`
  público que a tela de login do painel usa (seção "5-C") — nome, cor e
  logo do operador aparecem também no app do motorista, sem duplicar
  configuração.
- **CORS multi-origem**: `CORS_ORIGIN` no `.env` da API passou a aceitar
  lista separada por vírgula (`main.ts` e `RealtimeGateway` fazem
  `.split(',')`) — antes só existia um consumidor web, agora existem dois
  (painel em `:5173`, app do motorista rodando via `expo start --web` em
  `:8081`).
- **"Chat com o passageiro" virou ligação real, não chat falso (superado —
  ver nota abaixo)**: nesta fase ainda não existia app de cliente para
  receber mensagens de dentro do app — construir uma caixa de chat que só
  o motorista vê e ninguém do outro lado recebe seria fingir uma
  funcionalidade que não existe (o mesmo princípio já aplicado aos canais
  push/SMS em Configurações). Em vez disso, "Ligar para o passageiro" abre
  a discagem nativa (`Linking.openURL('tel:...')`) para o telefone real do
  cliente — funciona de verdade, hoje, sem depender de nenhuma peça que
  ainda falta. "Enviar observação para a central" cobre o caso de avisar
  alguém sobre a corrida sem inventar um destinatário: vira uma
  notificação interna (`DriverAppService.sendNote`), visível para o
  operador, reaproveitando o mesmo `NotificationsService` que já existe.
  **Nota (depois que o app do cliente passou a existir):** a premissa que
  justificava essa decisão deixou de valer, e o chat de verdade foi
  implementado — `RideMessage` (por corrida, texto simples, janela igual
  a `DRIVER_ASSIGNED`→`IN_PROGRESS`, ver `RidesService.sendMessage`),
  exposto em `POST/GET /customer-app/rides/:id/messages` e o par
  equivalente em `driver-app`, entregue ao vivo pelo mesmo
  `RealtimeGateway` (`notifyCustomer`/`notifyDriver`, evento
  `ride-message.created`) com poll de reforço. "Ligar para o passageiro" e
  "Enviar observação para a central" continuam existindo — chat é para
  recados de texto durante a corrida, ligação é para urgência, observação
  é para avisar a central, não o passageiro.
- **Navegação por deep link, não SDK de mapas**: "Navegar" abre o app de
  mapas nativo do aparelho via link universal do Google Maps
  (`google.com/maps/dir/?api=1&destination=lat,lng`) — funciona em
  iOS/Android/web sem precisar de `GOOGLE_MAPS_API_KEY` nem SDK embutido.
  A distância mostrada (`Ride.distanceKm`) é a mesma calculada na criação
  da corrida para a tarifa, não uma distância restante recalculada em
  tempo real — não existe rastreamento de rota ativa ainda.
- **Avaliação do passageiro**: `Ride.customerRating` (1-5, definida uma
  única vez, só depois de `COMPLETED`) e `Customer.rating` recalculada
  como média de todas as corridas avaliadas daquele cliente
  (`DriverAppService.rateCustomer`). Mesma ideia que já existia para
  `Driver.rating`, só que na direção contrária — nenhum motorista via
  o rating do cliente antes de aceitar (não faria sentido: ele só avalia
  depois que a corrida termina).
- **Tela inicial com mapa de fundo**: `HomeScreen` virou um mapa em tela
  cheia com a marca, o status online/offline e o card da corrida
  flutuando por cima (`topOverlay`/`bottomSheet`) — a estrutura pedida
  pelo usuário a partir de referência funcional de um concorrente, redesenhada
  com nossa própria linguagem visual (nada de layout, ícones ou texto
  copiados; ver a regra do briefing original contra cópia de concorrentes).
  Sem tela de "ganhos" nem sino de notificação: não existem esses dados/
  fluxo ainda no backend, e fingir um número ali seria inventar dado — a
  mesma régra de honestidade de todo o projeto.
- **`react-native-maps` só em `.native.tsx`, nunca `.web.tsx`**: a
  biblioteca não tem renderer web — até só *importar* o módulo quebra o
  bundle web (`codegenNativeComponent` não existe fora de um app nativo).
  A solução não é um `if (Platform.OS !== 'web')` em volta do `<MapView>`
  (o `import` no topo do arquivo já teria sido avaliado antes desse `if`
  rodar) — é a convenção de sufixo de plataforma do Metro:
  `src/MapSection.native.tsx` (mapa de verdade) e `src/MapSection.web.tsx`
  (só o aviso), com um `src/MapSection.tsx` vazio só para o TypeScript
  achar um módulo base — o Metro nunca chega a empacotar esse último.
  Mesma régra de "sem chave, sem simular" do mapa operacional do painel:
  no Android, sem `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`, mostra o aviso em vez
  do mapa; no iOS não precisa de chave (Apple Maps é o padrão), mas a
  mesma trava se aplica por consistência entre plataformas.

## 5-G. App do cliente

`apps/customer` — mesmo empacotamento do `apps/driver` (Expo + React Native +
TypeScript, standalone fora dos workspaces), e o mesmo padrão de backend
(`apps/api/src/customer-app/`: `CustomerJwtStrategy`/`CustomerJwtAuthGuard`
com `type: 'customer'`, `CustomerRefreshToken` própria, senha definida pelo
admin em **Clientes → editar → Senha do app do cliente**). A seção 5-D já
previa esse desenho antes de existir; aqui só trocou quem chama.

- **Sem Google Places, de propósito**: a busca de destino usa
  `CustomerAddress` (endereços salvos) mais uma tela de "marcar no mapa"
  (pino fixo no centro, arrasta o mapa por baixo — mais preciso que tocar
  num ponto). Decisão explícita do cliente do projeto para não contratar
  uma API paga só para autocomplete de texto; o `MapSection` do app de
  cliente já nasceu com essa capacidade (`centerPin`), diferente do do
  motorista, que só precisava mostrar posição.
- **Bug real pego testando no iPhone**: "Usar este local" no marcar-no-mapa
  ficava desabilitado até o cliente digitar uma descrição de pelo menos 3
  caracteres — sem nenhuma mensagem explicando por quê, então arrastar o
  pino "não funcionava" do ponto de vista de quem testava. Corrigido: o
  botão habilita assim que o pino é posicionado; a descrição virou opcional.
- **Origem também ajustável no mapa, a pedido do cliente do projeto**: até
  então `ConfirmRideScreen` só deixava editar o *rótulo* de texto da
  origem — a latitude/longitude de despacho vinha sempre do GPS, fixas,
  sem como corrigir se o GPS errasse o ponto. Agora tem um botão "Ajustar"
  ao lado do campo, abrindo o mesmo `centerPin` do marcar-destino, mas
  pré-carregado na posição do GPS — confirma com um toque se já estiver
  certo, ou arrasta para corrigir.
- **Geocodificação reversa pelo aparelho, não pelo Google**: pediu-se, com
  razão, que o endereço marcado no mapa mostrasse o endereço de verdade em
  vez de um texto genérico. Diferente do Google Places (autocomplete de
  texto, recusado por custo — ver acima), converter coordenada→endereço é
  outra API do Google Maps Platform, também paga, também dependente da
  decisão de billing ainda pendente (§7). Em vez de esperar por essa
  decisão, `App.tsx`'s `reverseGeocodeAddress` usa
  `Location.reverseGeocodeAsync` do `expo-location` — já era dependência
  do projeto (GPS) — que chama o geocoder nativo do aparelho (Apple Maps no
  iOS, Google Play services no Android), sem chave, sem custo, sem decisão
  de billing envolvida. Uma descrição manual digitada pelo cliente
  (destino) sempre tem prioridade sobre o resultado do geocoder; se a
  geocodificação falhar (sem sinal, aparelho sem suporte), cai no texto
  genérico "Local marcado no mapa" em vez de travar o fluxo. Não funciona
  no target web (`expo-location` não implementa lá), mas a tela de marcar
  no mapa já é inacessível na web (`MAP_AVAILABLE=false`).
- **`LocationPickerScreen`, uma tela só para os três fluxos de escolher
  ponto** (destino, ajustar origem, endereço salvo): antes cada fluxo tinha
  sua própria cópia quase igual do mapa com pino central; unificados numa
  tela compartilhada com duas formas de apontar um lugar — busca por texto
  (`Location.geocodeAsync`, mesmo geocoder nativo do item acima, então
  também sem Google Places/chave) ou arrastar o pino — e um campo de
  descrição sempre editável no final, pré-preenchido pelo resultado da
  busca ou da geocodificação reversa do pino, mas que o cliente pode
  corrigir à mão antes de confirmar (número errado por imprecisão do
  geocoder, por exemplo). `PickDestinationScreen`, o "Ajustar" de origem em
  `ConfirmRideScreen` e a nova tela de endereços salvos (abaixo) usam essa
  mesma tela, só trocando o `initialCenter`/`initialDescription` e o que
  acontece no `onConfirm`.
- **Corrida agora deixa editar destino também, não só origem**: antes
  `ConfirmRideScreen` mostrava `destination.address` como texto fixo — se o
  pino tivesse marcado a casa errada (número impreciso do geocoder, por
  exemplo), não tinha como corrigir sem voltar e marcar tudo de novo. Virou
  `TextInput` com o mesmo botão "Ajustar" que a origem já tinha, reabrindo
  o `LocationPickerScreen` na posição atual do destino.
- **"Meus endereços" (Conta → Meus endereços)**: antes só existia
  `listAddresses`/`addAddress`/`removeAddress` no backend, sem nenhuma tela
  no app pra usar — o endereço "Casa" que aparecia no picker de destino só
  existia porque foi inserido direto no banco (seed), o cliente não tinha
  como cadastrar o próprio. Adicionado `updateAddress` (`PATCH
  /customer-app/addresses/:id`, só editar os próprios endereços — não
  existia edição nem no admin) e a tela `AddressesScreen`: lista com
  Editar/Remover, e "Adicionar endereço" (nome + `LocationPickerScreen`
  pra marcar o local). Editar abre o mesmo picker já centralizado na
  posição atual do endereço, com a descrição pré-preenchida — resolve
  diretamente o caso de mudança de casa/trabalho sem precisar apagar e
  recriar o endereço (perderia o nome/label).
- **`CustomerAppService.currentRide` inclui a corrida recém-concluída não
  avaliada**: diferente do motorista, que fecha a própria corrida com um
  toque em "Finalizar" (dá pra capturar a referência antes de limpar o
  estado local), quem termina a corrida do lado do cliente é o motorista —
  o cliente só sabe pelo socket/poll. Sem um jeito de "capturar antes de
  sumir", a solução foi do lado do servidor: `currentRide` devolve tanto
  corridas ativas quanto a última `COMPLETED` com `driverRating: null`. Assim
  que avaliada, some da consulta sozinha.
- **"Agora não" é local, não do servidor**: a primeira versão só chamava
  `onDone()` sem marcar nada — a mesma corrida não avaliada voltava a
  aparecer a cada abertura do app, um beco sem saída real (pego ao testar
  ao vivo). Corrigido com uma lista de IDs "dispensados" no
  `AsyncStorage` (`dismissRating`/`isRatingDismissed` em `src/api.ts`,
  limitada a 20 entradas) — o cliente pode voltar e avaliar depois pelo
  histórico, mas a tela inicial não fica mais travada.
- **Forma de pagamento é só rótulo**, igual ao cadastro manual do admin —
  `Ride.paymentMethod` (dinheiro/Pix/cartão/carteira) sem processar
  cobrança de verdade, porque o financeiro do sistema é pós-pago (comissão
  descontada do repasse, não um débito na hora).
- **Carteira, cupom, cartão salvo, corrida agendada e motorista favorito —
  implementados depois, a pedido explícito** (ver 5-H): a primeira versão
  deste app deixou esses cinco de fora por não terem dado/regra de negócio
  ainda; o cliente do projeto pediu para implementar mesmo assim, "para
  vermos como fica", depois de ver os mesmos prints de referência
  funcional. Sem desafios, cashback ou bloqueio de motorista pelo
  cliente — esses continuam fora, sem pedido explícito para entrar.
- **Navegação por abas (Início/Atividade/Conta)**: segunda leva de
  referência funcional (outro app de mobilidade real, mesma regra de não
  copiar visual/texto/estrutura). Três abas fixas não justificam
  `@react-navigation` — o app já trocava de tela com `useState`
  (`view`/`activeTab` em `App.tsx`); uma biblioteca de navegação seria
  peso extra sem ganho real nesse tamanho. `Atividade` reaproveita dado
  que já existia (histórico de corridas) e só não estava exposto no app;
  `Conta` reúne perfil (leitura), troca de senha autoatendida (exige
  senha atual — diferente da senha inicial, definida pelo admin) e um
  "Fale conosco" que, no mesmo espírito do `sendNote` do motorista, vira
  notificação interna para a central em vez de fingir um canal de
  suporte que não existe. Login social (Apple/Google/Facebook) ficou de
  fora — precisaria de credenciais OAuth com cada provedor, decisão fora
  do escopo técnico.

## 5-H. Carteira, cupom, cartão salvo, corrida agendada e motorista
favorito

Continuação direta da 5-G: a primeira versão do app do cliente excluiu
esses cinco por não terem modelo de dados ainda. O cliente do projeto
pediu explicitamente para implementar mesmo assim ("tem que ter motorista
favorito, cupom, carteira, cartão salvo, corrida agendada pelo cliente
para vermos como fica"), depois de comparar com os mesmos prints de
referência funcional que motivaram a 5-G — decisão dele, não uma correção
de escopo mal calculado.

- **`Coupon`, `WalletTransaction`, `CustomerCard`, `CustomerFavoriteDriver`
  são modelos novos** (`apps/api/prisma/schema.prisma`), sem reaproveitar
  nada do admin porque nada existia: cupom nunca teve tela nem regra,
  carteira nunca teve saldo, cartão nunca foi salvo, favoritar motorista
  nunca foi uma ação. `Ride` ganhou `couponCode`/`discountApplied` (preço
  final congela o desconto aplicado, mesma regra de nunca recalcular preço
  passado) e `scheduledAt` passou a ser usado de verdade (já existia no
  schema, mas nada preenchia).
- **Cartão salvo nunca guarda número completo nem CVV** — decisão de
  segurança que não depende do pedido do cliente do projeto: `CustomerCard`
  só tem `brand`/`last4`/`expiry`, um rótulo de exibição escolhido pelo
  próprio usuário no cadastro, não um token de gateway de pagamento. Não
  existe gateway integrado em lugar nenhum do sistema (ver "Forma de
  pagamento é só rótulo" na 5-G) — "cartão salvo" aqui é cosmético, do
  mesmo jeito que "carteira" é um número no banco sem PIX de verdade por
  trás (`CustomerAppService.topUpWallet`, recarga instantânea e simulada).
- **Cupom é validado duas vezes com a mesma regra, não-bloqueante no
  preview e bloqueante no pedido**: `CouponsService.validate` é chamado
  tanto em `CustomerAppService.previewFare` (captura o erro e devolve sem
  desconto — o cliente ainda vê o preço normal) quanto em
  `RidesService.create` (deixa o erro propagar — cupom inválido não deveria
  ter passado da tela de confirmação). Evita a situação de o preview
  mostrar um desconto que o pedido depois rejeita silenciosamente.
- **Corrida agendada não despacha na hora, nem aparece como "corrida
  atual"**: `RidesService.create` pula o auto-despacho quando
  `scheduledAt` está a mais de 60s no futuro (`isFutureSchedule`), e um
  `@Cron(EVERY_MINUTE)` (`dispatchScheduledRides`) pega a corrida quando
  chega a hora — mesmo `tryAutoAssign` que o pedido imediato usa, só que
  disparado pelo relógio em vez da requisição HTTP. Bug real pego ao testar
  ao vivo: `CustomerAppService.currentRide` tratava qualquer corrida
  `REQUESTED` como "em andamento", então uma corrida agendada pra daqui a
  3 horas aparecia na tela inicial como se um motorista já estivesse a
  caminho. Corrigido filtrando `scheduledAt` nulo ou já próximo (mesma
  janela de 60s do despacho) — sem isso, "ver como fica" mostraria um
  estado errado.
- **Carteira debita no `advanceStatus` → `COMPLETED`, não no pedido**: a
  checagem de saldo suficiente acontece em `RidesService.create` (rejeita
  antes de criar a corrida se `walletBalance < finalPrice`), mas o débito
  de verdade e o registro do `WalletTransaction` (`type: RIDE_PAYMENT`) só
  acontecem quando a corrida é marcada `COMPLETED` — segue o mesmo momento
  em que `FinanceiroService.generateTransactionsForRide` já roda, corrida
  cancelada não debita nada.
- **Motorista favorito vive na tela de avaliação, não numa aba própria**:
  depois de avaliar o motorista (`RatingScreen`), um checkbox oferece
  marcá-lo como favorito no mesmo fluxo — espelha o ponto em que o
  cliente acabou de interagir com aquele motorista específico, em vez de
  forçar uma segunda ida à lista de corridas para lembrar o nome dele.
  `CustomerFavoriteDriver` tem `@@unique([customerId, driverId])` e o
  endpoint usa `upsert`, então marcar duas vezes não duplica nem quebra.

## 5-I. App do motorista: abas Programadas, Atividade (com Ganhos) e Conta

O app do motorista (5-F) tinha só uma tela — login e a corrida atual, sem
navegação nenhuma. Comparando com o que o app do cliente já tinha (5-G),
ficou pra trás em autoatendimento: sem histórico, sem troca de senha, sem
visão de quanto o motorista ganhou, sem visão de corridas agendadas.
Adicionado seguindo o mesmo padrão de abas do app do cliente (`useState`
local, sem `@react-navigation`), uma de cada vez — a primeira versão tinha
Ganhos como aba própria, reorganizada a pedido do cliente do projeto para
Ganhos ficar no topo da aba Atividade (mesma tela, um scroll só) e o espaço
da aba virar **Programadas**:

- **Atividade**, com Ganhos no topo: `DriverAppService.earnings` não criou
  nenhum cálculo novo, só chama `FinanceiroService.getSummary({ driverId })`
  e `.findTransactions({ driverId, type: 'DRIVER_PAYOUT' })`, o mesmo
  service que a tela de Financeiro do admin usa — o motorista vê exatamente
  o repasse (`DRIVER_PAYOUT`, comissão já descontada) que o admin vê, só
  filtrado pra ele. Abaixo, `DriverAppService.rideHistory` (mesmo formato
  do app do cliente: `select` enxuto, `take: 50`, sem paginação de verdade
  ainda) lista o histórico de corridas.
- **Programadas**: `DriverAppService.scheduledRides` lista corridas com
  `driverId` deste motorista e `scheduledAt` no futuro. Importante: hoje
  isso só é populado de duas formas — o despacho automático assume a
  corrida perto do horário (`RidesService.dispatchScheduledRides`, cron de
  minuto em minuto — nesse caso a corrida some daqui rápido, porque
  `scheduledAt` já está prestes a virar passado) ou a central atribui um
  motorista na hora de agendar por telefone (`POST /rides` com `driverId` e
  `scheduledAt` futuro, mesmo padrão de "corrida manual" já documentado em
  5). **Não existe hoje uma oferta antecipada de corrida agendada para o
  motorista escolher** — o motorista não "reserva" uma corrida de daqui a
  3 dias sozinho; só vê aqui o que já foi atribuído a ele por um desses dois
  caminhos.
- **Bug corrigido no mesmo lote**: `DriverAppService.currentRide` não tinha
  o filtro de `scheduledAt` que `CustomerAppService.currentRide` já tinha
  (ver 5-H) — uma corrida agendada pra dias depois, com motorista atribuído
  manualmente pela central, aparecia na aba Início como se estivesse
  rolando agora, com botão Aceitar/Recusar de uma corrida que só começa
  dias depois. Mesmo fix: só conta como "atual" se `scheduledAt` for nulo
  ou estiver a menos de 60s de distância.
- **Conta**: troca de senha autoatendida (`changePassword`, exige senha
  atual — diferente de `DriversService.setPassword`, que é o admin
  definindo sem confirmação) e "Fale conosco" fora do contexto de uma
  corrida (`sendSupportMessage`, mesma notificação interna que `sendNote`
  já usa durante uma corrida, só sem depender de ter uma corrida ativa).
- **Bug de corrida em `src/api.ts` (motorista e cliente)**: o refresh token
  é rotativo (`DriverAuthService`/`CustomerAuthService`.refresh revoga o
  antigo a cada uso). A tela de Atividade foi a primeira a disparar duas
  chamadas autenticadas em paralelo no mesmo `useEffect` (Ganhos +
  histórico) — se o token expirasse bem nesse instante, as duas cairiam no
  401 e cada uma chamaria `refreshSession()` por conta própria: a primeira
  vencia a corrida e revogava o refresh token, a segunda usava o mesmo
  token (já revogado) e falhava, mostrando a aba zerada mesmo com os dados
  certos no banco. Corrigido em `src/api.ts` de ambos os apps com um
  `refreshPromise` compartilhado — chamadas concorrentes esperam o mesmo
  refresh em vez de disparar um cada.

## 5-J. Revisão de segurança e robustez (2026-09-26)

Auditoria completa (API, Central, app do cliente e do motorista) com testes ao
vivo. Bugs encontrados e corrigidos — o porquê de cada regra abaixo:

- **Vazamento pelo WebSocket**: `broadcastRideUpdated/DriverUpdated/
  NotificationCreated` usavam `server.emit()` (todas as conexões), então um
  socket de *cliente* recebia o registro completo de qualquer motorista (CPF,
  telefone, hash de senha) e de qualquer corrida. Agora só a sala `admins`
  (entra quem tem token `type: 'admin'`) recebe esses eventos.
- **Hash de senha nas respostas e na auditoria**: as rotas devolviam a linha
  inteira do Prisma (`GET /customers/:id`, `/drivers`, `/customer-app/me`…).
  `StripSecretsInterceptor` (global) remove `passwordHash` de toda resposta,
  `AuditService.log` e o gateway usam o mesmo `stripSecrets`; a migration
  `scrub_audit_password_hash` limpou o que já tinha sido gravado.
- **Token vale só enquanto a conta vale**: as três strategies JWT agora
  consultam o banco a cada requisição — cliente/motorista bloqueado perde o
  acesso na hora (antes até 15 min) e o admin usa as permissões atuais do
  cargo, não as que estavam no token.
- **Força bruta no login**: `throttledLogin` (8 falhas / 15 min por IP +
  identificador; login certo zera). Em memória — com mais de uma instância da
  API trocar por Redis (`ponytail` no arquivo).
- **Erros do Prisma**: o filtro global mapeia P2025→404, P2002→409, P2003 e
  filtro inválido→400 (antes tudo virava 500 "Erro interno") e agora *loga*
  todo 5xx.
- **Corrida — concorrência**: transições (`advance/cancel/assign/redispatch`)
  usam `guardedUpdate` (update com o status esperado no `where`; conflito →
  409). Completar duas vezes gerava repasse e débito de carteira em dobro. O
  motorista é reivindicado de forma atômica (`AVAILABLE→BUSY` condicional) — dois
  pedidos simultâneos não pegam mais o mesmo motorista.
- **Corrida — regras**: cliente não tem duas corridas imediatas ativas; cliente
  bloqueado/inexistente e motorista não aprovado/ocupado são recusados também
  no `POST /rides` do admin; cliente não cancela com a viagem `IN_PROGRESS`
  (sairia sem cobrança); motorista não muda disponibilidade durante uma corrida.
- **Despacho**: a anotação de recusa (`declined`) era gravada como outro evento
  `DRIVER_ASSIGNED` e contava como tentativa (limite de 3 virava 2); agora só
  oferta conta. Esgotar as tentativas **não é mais erro** — a corrida volta a
  `SEARCHING_DRIVER` com notificação interna, e o motorista sempre consegue
  recusar (antes recebia 400 e ficava preso na oferta). Corrida criada já com
  motorista grava `driverId` no evento (não é re-oferecida ao mesmo).
- **Cupom**: corrida + resgate na mesma transação (cupom esgotando no meio criava
  corrida órfã com desconto); cancelar a corrida devolve o uso (`release`).
- **Fuso horário**: horário de pico, dia da semana e faturamento por dia usam
  `APP_TZ_OFFSET` (padrão `-03:00`), não o relógio do servidor (em UTC o pico
  valia 3 h adiantado). Filtro "até 2026-09-26" agora inclui o dia inteiro.
- **Apps**: `request()` com timeout de 15 s (IP errado não deixa mais o spinner
  eterno), refresh recusado leva ao login, socket reconecta com o token novo,
  motorista sincroniza online/offline com o servidor ao abrir e sai de "online" ao
  fazer logout, ganhos não viram "R$ 0,00" quando a requisição falha, cupom não é
  descartado ao ajustar origem/destino. Central: aviso flutuante para erro de
  ação (`ErrorToast` + `MutationCache`) — muita ação falhava em silêncio.
- **Presença do motorista** (`common/presence.ts`, `Driver.lastSeenAt`): o app
  manda `POST /driver-app/heartbeat` a cada 60 s enquanto online e ao voltar
  pro primeiro plano. O despacho só oferece corrida a quem deu sinal nos
  últimos 3 min, e um cron (`DriversService.expireStalePresence`, 1/min) coloca
  `OFFLINE` quem estava `AVAILABLE` sem sinal — antes, fechar o app deixava o
  motorista "disponível" pra sempre absorvendo ofertas. Quem está em corrida
  (`BUSY`…) não é derrubado. O heartbeat devolve a disponibilidade real, então
  o botão Online/Offline do app acompanha o servidor. Contam como sinal: o
  heartbeat, a localização enviada pelo app e ficar `AVAILABLE` (app ou
  operador, com 3 min de carência); a correção manual de posição pelo admin
  não conta. O app mantém a tela ligada enquanto o motorista está online
  (`expo-keep-awake`): com a tela bloqueada o sistema pausa o app, o sinal para
  e em 3 min ele ficaria offline sem perceber. Consequência para teste: motorista marcado disponível só pela
  Central, sem o app aberto, volta a offline em ~3 min.
- **Expiração de oferta e retentativa** (`RidesService.dispatchTick`, a cada
  3 s, com trava contra rodadas sobrepostas): o despacho automático grava
  `Ride.offerExpiresAt` = agora + `tempoOfertaSegundos` (Despacho, padrão 15 s).
  Passou do prazo sem resposta, `expireStaleOffers` chama o mesmo `redispatch`
  de "Recusar"/"Motorista não respondeu", marcando o evento com
  `timedOut: true` (a Central mostra "não respondeu a tempo"; a auditoria
  registra como Sistema; não conta como tentativa extra). Atribuição manual do
  operador não tem prazo (`offerExpiresAt` = null). Corrida em
  `SEARCHING_DRIVER` (ninguém online no pedido, ou recusas/expirações) é
  reprocessada a cada rodada por `processSearchingRides`: motorista que fica
  online no meio da busca pega a corrida, quem já foi oferecido não repete e o
  limite `tentativasDespacho` continua valendo. Passado
  `tempoEsperaMinutos` (Despacho, padrão 2 min; agendada conta a partir da hora
  marcada) a corrida é cancelada sozinha com o motivo "Nenhum motorista
  disponível no momento…", cupom devolvido e central avisada. Pior caso de
  latência de uma expiração = prazo + 3 s.
  `tryAutoAssign` agora é condicional ao status esperado (cliente cancelando
  no meio da escolha não é sobrescrito; o motorista reservado é devolvido).
  No app do cliente, `currentRide` também devolve a corrida cancelada nos
  últimos 10 min (`CancelledCard` explica o motivo até o "Ok"); cancelar por
  conta própria já dispensa o aviso. No app do motorista a oferta mostra
  "Responda em Ns" e, se sumir sem ação dele, avisa que foi repassada.
- **Paginação e contadores** (`common/pagination.ts`): as listas do painel
  (clientes, motoristas, corridas, transações do financeiro, auditoria,
  notificações) aceitam `?page=&pageSize=` e devolvem o array de sempre com o
  total no cabeçalho `X-Total-Count` (exposto no CORS) — quem consome sem
  parâmetros vê o mesmo de antes (até 200 linhas), só que agora com o total
  real. Os services devolvem `Page` e `PaginationInterceptor` desembrulha (deve
  ficar depois do `StripSecretsInterceptor` em `main.ts`). `pageSize` tem teto
  de 1000 e valor inválido cai no padrão. Toda lista paginada ordena por data
  **e por `id`** — linhas criadas no mesmo instante teriam ordem instável e
  repetiriam/sumiriam entre páginas. No painel: `usePage` (volta para a página 1
  quando o filtro muda), `<Pagination>` e `fetchPage`; exportar CSV percorre
  todas as páginas do filtro (`fetchAll`, teto de 5.000 linhas). Cliente na
  criação de corrida é escolhido por busca (nome/CPF), não por lista. O
  Dashboard usa `GET /dashboard/summary` (COUNT no banco, só dos módulos que o
  usuário pode ver; o resto volta `null` e aparece "—") e atualiza em tempo
  real; "em andamento" não conta agendada para mais tarde. Não paginados
  (ainda): histórico dos apps (últimos 50), corridas agendadas (200), seletores
  de motoristas/clientes do Financeiro e mapa (até 1.000).
- **CPF com dígito verificador** (`common/cpf.ts`, `IsCpf`): cadastro de
  cliente e de motorista pela Central recusa CPF que não passa na conta dos dois
  dígitos ou que tem todos os dígitos iguais (antes valia qualquer sequência de
  11 números). O painel valida igual no formulário (`web/src/lib/cpf.ts`) antes
  de enviar; o motorista já cadastrado (CPF travado na edição) não é
  revalidado. **O login de cliente e de motorista NÃO valida** o dígito — contas
  antigas de teste (ex.: 123.456.789-01) têm CPF que não passa na conta e
  ficariam trancadas para fora. Ao criar contas de teste, use CPF válido
  (ex.: 529.982.247-25, 111.444.777-35).
- **Telefone só depois de aceitar**: enquanto a corrida é só uma oferta
  (`DRIVER_ASSIGNED`), o motorista vê nome e endereços do passageiro mas **não o
  telefone**, e o cliente vê o motorista (nome, veículo, nota) mas não o telefone
  dele — antes dava para recusar só para ligar por fora da plataforma. O servidor
  omite o campo (`currentRide` dos dois apps e `scheduledRides` do motorista,
  `withoutPhoneWhileOffered`); depois do aceite (`DRIVER_EN_ROUTE` em diante) o
  telefone volta e os apps mostram "Ligar para…". O chat da corrida continua
  aberto desde a oferta.
- **Sino de notificações na Central** (`features/notifications/NotificationBell`):
  no topo da barra lateral, com a contagem de não lidas (`GET
  /notifications/unread-count`), um painel com as 8 mais recentes não lidas
  (`GET /notifications?unread=true&pageSize=8`), "Marcar todas como lidas"
  (`PATCH /notifications/read-all`, um `updateMany` só nas não lidas) e "Ver
  todas". Clicar num aviso o marca como lido e leva à tela do assunto (Fale
  conosco → Configurações → Notificações para responder; motorista novo →
  Motoristas/Aprovação; corrida/despacho → Corridas — o mapeamento é por título,
  em `destinationFor`). A contagem também vai no título da aba do navegador
  (`(3) Central de Controle`), atualiza em tempo real (`notification.created`
  pelo socket dos admins) e a cada 60 s. Só aparece para quem tem
  `dashboard.visualizar` (mesma permissão das rotas de notificação).
- **Permissões do painel sempre atuais**: o usuário guardado no navegador
  (`central.user`) é o do momento do login — mudar o cargo de alguém (dar ou tirar
  permissão) deixava o menu errado até sair e entrar de novo, mesmo com a API já
  barrando pelo cargo novo (a `JwtStrategy` relê o cargo a cada requisição).
  Agora `GET /auth/me` devolve `{ id, name, email, role, permissions }` (mesmo
  formato do `user` do login, com o cargo atual) e o `AuthProvider` o chama ao
  abrir, ao voltar para a aba (`focus`) e quando qualquer chamada leva 403
  (evento `central:permissions-stale`, disparado em `lib/api.ts`), no máximo
  uma vez a cada 30 s. Quem foi bloqueado/excluído cai no login pelo interceptor
  de 401. Antes o `/auth/me` devolvia o payload do token cru.
- **Pagamento e cupom na corrida criada pela Central**: o formulário "Nova
  corrida" ganhou forma de pagamento (padrão Dinheiro) e cupom, com uma
  estimativa ao vivo (`POST /rides/quote`, `corridas.editar`): mesmo cálculo de
  preço e mesma validação de cupom do `POST /rides`, sem gravar nada nem
  consumir o cupom. Cupom inválido volta como `couponError` (mensagem, não erro
  HTTP) e desabilita o "Salvar"; escolhendo Carteira mostra o saldo do cliente e
  bloqueia se for menor que o preço. O detalhe da corrida e a exportação CSV
  passaram a mostrar pagamento, cupom e desconto.
- **Pagamento direto ao motorista (fora do app)**: o passageiro paga ao motorista
  no fim da corrida — dinheiro, Pix na chave dele ou cartão na máquina dele; a
  plataforma não movimenta dinheiro. `Driver.pixKey` e `Driver.hasCardMachine`
  (o motorista edita no app, aba Conta → "Como você recebe", ou a Central no
  cadastro; mudança pelo app vai para a auditoria com antes/depois). O despacho
  respeita isso (`common/payment.ts`): corrida no cartão só vai a quem tem
  máquina, no Pix só a quem tem chave (senão fica em busca até o tempo máximo);
  dinheiro não restringe. Atribuição manual pela Central só **avisa** (⚠ no
  seletor + confirmação). O motorista vê a forma de pagamento na oferta; o
  cliente vê "como pagar" depois do aceite e, no Pix, a chave do motorista com
  botão de copiar (`customer-app.service` esconde chave e telefone durante a
  oferta e em corrida cancelada, e a chave em qualquer corrida que não seja Pix).
  **Decisão do dono**: o Financeiro da Central continua como está — mostra o
  total feito no dia somando todos os motoristas, mesmo que eles não recebam
  esse valor da plataforma (é só para a operação saber quanto foi feito). Carteira
  e cartões salvos ficam no lugar. Não haverá gateway de pagamento.
- **App do motorista: "Ganhos" virou "Resumo"** (`GET /driver-app/summary`, no
  lugar de `/earnings`): quantas corridas concluídas e o total delas hoje e no
  mês (no fuso da operação), somado das corridas do próprio motorista. Antes
  mostrava "A receber / Já recebido" a partir dos repasses do Financeiro — o que
  sugeria que a plataforma pagaria o motorista, mas o passageiro paga direto a
  ele. O Financeiro da Central não mudou.
- **Continua fora (limitação conhecida, não bug)**: sem push notification (o
  motorista só vê a oferta com o app aberto — decisão: o app precisa estar
  aberto e online), sem GPS com a tela apagada (o app mantém a tela ligada
  enquanto online), carteira/cartão/pagamento sem gateway real.

## 5-K. PostGIS (preparado, não ligado no despacho/precificação de verdade)

- **O quê**: a extensão PostGIS está habilitada no banco (migration
  `enable_postgis`) e duas colunas geoespaciais indexadas (GiST) existem e são
  mantidas **por trigger no Postgres**, não pela aplicação: `Driver.geom`
  (`geography(Point,4326)`, espelha `lastLat`/`lastLng`) e
  `PricingZone.geom` (`geometry(Geometry,4326)`, espelha `geometry`/`shape` —
  círculo vira polígono via `ST_Buffer`). Como os triggers disparam em
  `BEFORE INSERT OR UPDATE` dessas colunas, **nenhum código da aplicação foi
  tocado**: heartbeat, atualização de GPS pelo app, correção manual pelo
  admin, cadastro/edição de zona — tudo continua gravando exatamente como
  antes e o `geom` se atualiza sozinho. No `schema.prisma` os campos são
  `Unsupported(...)`, então o Prisma Client nem inclui `geom` nas consultas
  normais (`findMany`, `select` sem pedir explicitamente) — só dá pra ler via
  `$queryRaw`, e só quem for buscar de propósito é afetado.
- **Por que não está ligado no despacho/precificação por padrão**: o casamento
  em memória (`RidesService.findNearestAvailableDriver`, haversine) e o
  point-in-polygon em JS (`PricingEngineService.findApplicableZone`) já são
  testados extensivamente (200+ casos) e funcionam bem no volume atual — a
  seção 6 já dizia que isso "não é necessário na Fase 1-4". Trocar o caminho
  ativo do despacho exigiria reescrever essa bateria de testes (eles mockam
  `prisma.driver.findMany` diretamente) por pouco ganho agora. Em vez disso,
  ficou pronto e testado, para trocar quando o volume justificar.
- **`apps/api/src/common/postgis.ts`** tem as duas consultas prontas,
  equivalentes ponto a ponto ao que roda hoje (mesmos critérios: aprovado,
  disponível, sinal de vida recente — `presenceCutoff()` —, capaz de receber a
  forma de pagamento — mesma regra de `common/payment.ts`, duplicada em SQL de
  propósito —, prefere o raio preferencial e só cai pro raio máximo se
  ninguém estiver dentro dele):
  - `nearestDriverPostgis(prisma, origin, options)` — substituiria
    `RidesService.findNearestAvailableDriver`: uma consulta indexada
    (`ST_DWithin` + operador KNN `<->`) no lugar de trazer todo mundo pra
    memória e calcular haversine em JS.
  - `zonesContainingPoint(prisma, zoneIds, point)` — substituiria o
    `isPointInPolygon`/`isPointInCircle` dentro de `findApplicableZone`
    (`ST_Contains`), recebendo só os ids já filtrados por data/dia/horário
    (isso continua em JS, não é espacial).
  - Testado com dados reais (`test/postgis.spec.ts` + comparação ao vivo
    contra o resultado do JS, motorista por motorista e zona por zona,
    incluindo as duas zonas reais já cadastradas — círculo e polígono):
    resultado idêntico em todos os casos.
- **Para ligar de verdade** (quando o volume justificar): trocar o corpo de
  `findNearestAvailableDriver` para chamar `nearestDriverPostgis` (mesmos
  parâmetros: origem, excluídos, só-estes, raio preferencial/máximo, forma de
  pagamento) e o trecho de `findApplicableZone` que testa a geometria para
  filtrar por `zonesContainingPoint` — reescrevendo os testes que hoje mockam
  `prisma.driver.findMany`/`isPointInPolygon` para mockar `$queryRaw`.
- **Requisito de ambiente**: `CREATE EXTENSION postgis` exige superusuário do
  Postgres. Em Docker (`docker-compose.yml`, imagem `postgis/postgis`) a
  migration cria sozinha, porque o usuário do banco já é superusuário do
  container. Fora do Docker (Postgres.app local, RDS, Supabase etc.), alguém
  com mais acesso roda `CREATE EXTENSION IF NOT EXISTS postgis;` uma vez antes
  de `npx prisma migrate deploy` — sem isso a migration falha com "permission
  denied to create extension" (não com o usuário normal da aplicação).

## 6. Riscos técnicos identificados

- **Tempo real (Fase 3):** localização de motoristas e status de corrida
  exigem WebSockets ou polling curto. NestJS tem gateway de WebSocket
  nativo (`@nestjs/websockets`); Redis entra aí como pub/sub entre
  instâncias da API quando houver mais de um processo rodando.
- **(Superado — ver 5-K: PostGIS já está disponível e testado.)**
  Geoprocessamento de zonas: checar se um ponto está dentro de um polígono
  era barato em memória para dezenas de zonas, mas não escalava
  indefinidamente via query SQL simples.
- **Consistência de preço:** o preço final de uma corrida precisa ser
  congelado no momento do cálculo (`Ride.pricingBreakdown`), não
  recalculado depois — senão uma mudança de tarifa altera corridas
  passadas. Já modelado assim.

## 7. Decisões pendentes do cliente

- Gateway de pagamento a integrar (Financeiro, Fase 5) — nenhum foi
  assumido no código ainda.
- Provedor de push/SMS (Notificações) — schema é genérico
  (`NotificationChannel`), sem acoplamento a um provedor específico.
- Conta e faturamento do Google Maps — por ora usar uma chave de
  desenvolvimento própria com restrição de domínio/IP.
