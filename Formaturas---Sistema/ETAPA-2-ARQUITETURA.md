# Etapa 2 — Arquitetura do Novo Sistema

> **Base:** consolida `docs/02-arquitetura.md`, `docs/backend-spec.md` e `docs/frontend-spec.md` com a realidade do legado mapeada na Etapa 1. **Cobre o que `docs/` ignorou:** o CRM operacional inteiro (cadastros, OS, NFe, monitoramento, mensageria, modelos, relatórios) que sustenta volume relevante em contratos hoje.
> **Pré-requisito:** ler `ETAPA-1-RELATORIO-ANALISE.md`.

---

## Sumário

1. Decisões herdadas e mantidas
2. Decisões refinadas (deltas vs `docs/02-arquitetura.md`)
3. Resolução das 11 inconsistências da Etapa 1 §14
4. ADRs novos (que faltavam)
5. CRM operacional legado: como ele aparece na nova arquitetura
6. Estrutura de monorepo final
7. Camadas e fluxo de request
8. Auth, RBAC, multi-tenant
9. Workers, filas, agendamentos
10. Integrações externas (consolidação)
11. Observabilidade
12. Segurança
13. Estratégia de migração e cutover
14. Custos estimados
15. Pendências para o cliente

---

## 1. Decisões herdadas e mantidas

| Camada | Decisão | Origem |
|---|---|---|
| Front-end | Next.js 15 (App Router) + React 19 + TypeScript strict + Tailwind v4 + shadcn/ui + Lucide + Zustand + TanStack Query + React Hook Form + Zod | `docs/02-arquitetura.md` ADR-001 + `docs/frontend-spec.md` |
| Back-end | Node 20 LTS + **Fastify 4** + Prisma 5 + Zod | `docs/02-arquitetura.md` ADR-002 + `docs/backend-spec.md` |
| Banco | PostgreSQL 16 (Supabase no MVP) com RLS | ADR-003 |
| Storage | Cloudflare R2 (egress = 0) | ADR-004 |
| Pagamento | Asaas (manter — já contratado) | ADR-005 + Etapa 1 §7 |
| Assinatura | ZapSign (manter — já contratado) | Etapa 1 §7 |
| WhatsApp | Z-API (BSP brasileiro) | ADR-006 |
| Reconhecimento facial | AWS Rekognition (MVP) → InsightFace (escala) | ADR-007 |
| Pulseira | Zebra ZD510-HC + print server local Node | ADR-008 |
| Auth aluno/comissão | Magic-link via WhatsApp (Z-API) | ADR-009 |
| Auth interno (Ventus, fotógrafo, editor) | Email + senha (argon2) + 2FA opcional | ADR-009 |
| Filas | BullMQ + Redis (Upstash) | `docs/backend-spec.md` |
| Deploy | Vercel (web) + Railway (api/workers) + Supabase (db) + R2 (storage) | ADR-010 |
| Monorepo | pnpm workspaces | `docs/backend-spec.md` |
| Estilo arquitetural | Modular monolith (não microservices) com workers separados por responsabilidade | `docs/02-arquitetura.md` §2.1 |
| Multi-tenant | Lógico via `tenant_id` em toda tabela + RLS no Postgres | `docs/02-arquitetura.md` §2.1 |
| LGPD | By design: consentimento explícito, soft-delete em PII, retenção de financeiro 5 anos, hard-delete de embeddings faciais | `docs/03-modelo-dados.md` §3.6 |

---

## 2. Decisões refinadas (deltas vs `docs/02-arquitetura.md`)

### 2.1 NFe permanece como adapter abstrato (não definir provider ainda)
O legado tem um módulo `Nota_fiscal/lista` e flag `valida_tag_nfe`, mas **o provider real não foi documentado** (Etapa 1 §13). Decisão: criar `INFeAdapter` no domínio `domain-billing` com 1 implementação stub + 1 implementação real (a definir após levantamento). Não migrar emissão para o novo sistema na Fase 1 — manter no legado durante o paralelo.

### 2.2 Mensageiro do legado fica como adapter
Mesmo padrão: `IMessagerAdapter` com 2 implementações:
- `ZapiAdapter` (novo)
- `LegacyMessagerAdapter` (chama o módulo `/Mensageiro` do legado durante a janela de coexistência, se necessário).

### 2.3 Kentro permanece TBD
Sem informação sobre o que faz. Não é dependência arquitetural — só aparece como `kentro_key` em `/Config`. Adiar para depois do levantamento.

### 2.4 Adicionar Sharp ao stack obrigatório do back-end
`docs/backend-spec.md` não lista Sharp, mas o módulo 4 depende dele para gerar thumbnails (300px webp) e preview (1200px q80). Adicionar ao `apps/worker-photos`.

### 2.5 Adicionar Resend (ou SendGrid) como adapter de email
`docs/02-divulgacao-convidados.md` cita email como fallback de WhatsApp; o backend-spec esquece. Decisão: `IEmailAdapter` com `ResendAdapter` no MVP (mais simples, melhor DX, free tier 3000/mês).

### 2.6 Trocar a estratégia de secrets
**Problema da Etapa 1 §14.4:** `Tenant.whatsappBspToken`, `Tenant.asaasApiKey` em colunas do Postgres. Inseguro em backup, log, replicação, debugger.

**Decisão:**
- Secrets globais (Asaas master, Z-API master, Rekognition, R2) → **variáveis de ambiente** servidas por **Doppler** (free tier) ou **AWS Secrets Manager** (Railway integra).
- Quando houver multi-tenant real com chaves por cliente: armazenar **referência** no Postgres (`asaasSecretRef = 'tenant/ventus/asaas'`) e fazer lookup no provider de secrets.
- **Nunca** valor de chave em coluna.

### 2.7 RLS continua, mas tenant resolution muda
`docs/backend-spec.md` resolvia tenant via `X-Tenant-Slug`. Risco: header forjado. Decisão:
- Para usuários autenticados: `tenant_id` vem do **JWT claim**, não do header.
- Para webhooks (Asaas, Z-API): `tenant_id` derivado de **payload assinado + lookup** (ex: `Asaas.customer.externalReference` aponta para `tenant_id`).
- Header `X-Tenant-Slug` continua existindo apenas para **roteamento de domínio público** (`turma.faculdade.com.br` → resolve slug → DNS sabe qual tenant), nunca como fonte de autoridade.

### 2.8 Realtime via Postgres Listen/Notify para o painel da portaria
`docs/02-arquitetura.md` §2.6 diz "polling é OK no MVP, exceto check-in". Decisão: usar `LISTEN/NOTIFY` do Postgres com SSE (Server-Sent Events) no painel ao vivo de check-in. Mais simples que WebSocket, mais barato que Pusher, escala até centenas de conexões simultâneas (que é o teto realista do caso de uso).

### 2.9 Print server local conversa via fila Redis pública (mTLS)
`docs/backend-spec.md` deixava em loopback. No mundo real, o mini-PC da portaria roda em rede Wi-Fi do salão de festa, e a API roda na nuvem. Decisão: print server conecta no Redis Cloud via TLS com cliente certificado (mTLS) **ou** em VPN Tailscale. Modo offline com SQLite local (até 100 jobs em fila) para resiliência.

---

## 3. Resolução das 11 inconsistências da Etapa 1 §14

| # | Inconsistência | Decisão |
|---|---|---|
| 1 | `Foto.deletedAt` ausente vs `DELETE /fotos/:id (soft)` | **Adicionar `deletedAt` em `Foto`** na Etapa 3. Soft-delete consistente. |
| 2 | Índice `idx_cobrancas_tenant_vencimento WHERE deleted_at IS NULL` mas `Cobranca` sem `deletedAt` | **Adicionar `deletedAt` em `Cobranca`**. Cobrança nunca é apagada de verdade (compliance fiscal 5 anos), mas pode ser marcada cancelada. Manter coluna por consistência de filtro. |
| 3 | Naming WhatsApp template `fotos_prontas` vs `fotos_finalizadas` | **Padronizar `fotos_finalizadas`** (semanticamente mais preciso: prontas pode confundir com "selecionáveis"). Submeter à Meta com esse nome. |
| 4 | Secrets em colunas | **Resolvido em §2.6.** |
| 5 | Sharp não no stack do backend | **Resolvido em §2.4.** |
| 6 | Tabelas `lgpd_eventos`, `audit_log`, `webhook_eventos`, `feature_flags` sem schema | **Definidas na Etapa 3** como tabelas Prisma de primeira classe. |
| 7 | HMAC do `qrToken` não modelado | **Mudar `qrToken` para par `qrToken (uuid)` + `qrSignature (HMAC-SHA256)`** com chave em env. Validação na portaria recalcula HMAC e compara. |
| 8 | Coleção Rekognition por turma vs evento | **Confirmado: por turma.** Coleção é criada na primeira foto de referência cadastrada na turma; deletada quando turma é arquivada. Comando `aws rekognition delete-collection --collection-id turma-${turmaId}` no soft-archive. |
| 9 | Asaas API key duplicada (`Tenant.asaasApiKey` + env) | **Resolvido em §2.6.** Só env (com referência por tenant quando multi-tenant). |
| 10 | "1000 fotos em <30min" requer 4+ workers paralelos sem autoscale declarado | **ADR-014 em §4.7** define autoscale: Railway scale-to-zero + scale-up por profundidade de fila. |
| 11 | Docs ignoram o legado | **Esta Etapa 2 + Etapa 4 + Etapa 3 corrigem isso.** O CRM operacional inteiro entra como cidadão de primeira classe (§5). |

---

## 4. ADRs novos (que faltavam)

### ADR-011 — Audit log em tabela própria com triggers Postgres
**Decisão:** tabela `audit_log` (`id`, `tenant_id`, `user_id`, `action`, `entity_type`, `entity_id`, `old_data` jsonb, `new_data` jsonb, `ip`, `user_agent`, `created_at`). Triggers automáticos em entidades sensíveis (`Contrato`, `Cobranca`, `OS`, `Formando`, `Usuario`, `Vendedor`). Retenção: 7 anos (Lei do CDC sugere 5; somar margem).

**Por quê:** o legado não tem auditoria — pergunta "quem alterou o valor desse contrato em 12/03?" hoje não tem resposta. Compliance + suporte ao cliente.

### ADR-012 — Feature flags em banco com cache Redis
**Decisão:** tabela `feature_flags` (`key`, `tenant_id` nullable, `enabled`, `payload` jsonb, `updated_at`). Cliente lê via SDK próprio (`getFlag('rekognition.v2')`) que consulta cache Redis (TTL 60s) e fallback para Postgres. Não usar Unleash/LaunchDarkly no MVP (over-engineering).

**Por quê:** rollout gradual de Rekognition v2 (InsightFace), kill switch para integrações externas, AB simples.

### ADR-013 — Webhook events em tabela com retry
**Decisão:** tabela `webhook_eventos` (`id`, `tenant_id`, `provider` enum (asaas, zapi, zapsign, rekognition), `event_type`, `payload` jsonb, `signature_valid` bool, `processed_at`, `processing_error`, `retry_count`, `received_at`). Webhook chega → grava primeiro → enfileira processamento → idempotente por `(provider, externalId)`.

**Por quê:** sem isso, qualquer falha de processamento perde dados financeiros (Asaas) ou comunicação (Z-API). Camada de log + retry resiliente.

### ADR-014 — Autoscale de workers por profundidade de fila
**Decisão:** Railway autoscale com regra `if BullMQ.queue('photos-face').waiting > 50 then scale to 4 instances else scale to 1`. Configurar via Railway API ou cron interno. Revisar limite a cada turma nova.

**Por quê:** 1000 fotos × 1 worker × 10 fotos/min = 100 min, fora do SLA de 30 min. Com 4 workers paralelos = 25 min, dentro.

### ADR-015 — Migração paralela com tabela `legacy_id` e cutover por turma
**Decisão:**
- Toda entidade migrada do legado tem `legacyId text @unique` apontando ao `cd_*` original (formato `'turma:0042'` ou `'aluno:1234'`).
- ETL inicial faz "shadow read" — escreve no novo sem operar.
- Cutover é **por turma**: turma X passa a operar 100% no novo (legado fica read-only para essa turma) só quando a comissão e a equipe Ventus aprovarem.
- Janela de coexistência: ~3 meses, esperando todas as turmas ativas migrarem ou encerrarem.

**Por quê:** Big Bang em sistema com contratos vivos em produção é suicida. Migração por turma reduz blast radius drasticamente.

### ADR-016 — Idempotência via tabela `idempotency_keys`
**Decisão:** tabela `idempotency_keys` (`key`, `tenant_id`, `endpoint`, `request_hash`, `response_status`, `response_body`, `created_at`, `expires_at`). TTL 24h. Header `Idempotency-Key` obrigatório em POSTs financeiros.

**Por quê:** evitar dupla cobrança no Asaas em retry de cliente, dupla emissão de NFe, dupla impressão de pulseira.

### ADR-017 — Observabilidade unificada
**Decisão:**
- **Logs estruturados** (Pino) → CloudWatch ou Better Stack (free tier).
- **Erros** → Sentry (front + back, free tier 5k events/mês).
- **Produto** → PostHog Cloud (1M events/mês free).
- **Métricas de negócio** (turmas ativas, taxa de pagamento, p95 de upload) → Grafana Cloud (free tier 10k metrics).
- **APM** → opcional, só se p95 das rotas ficar errático.

**Por quê:** stack atual não tem nada — debug em produção hoje é caçar log no servidor PHP.

### ADR-018 — i18n estruturado mesmo sendo só pt-BR
**Decisão:** todas as strings de UI passam por `next-intl` desde o dia 1, mesmo só com `pt-BR.json`. Custo zero, ganho enorme se um dia outra produtora de formatura quiser white-label em outra língua.

**Por quê:** retrofit de i18n em projeto Next.js com 60+ telas é doloroso. Fazer certo desde o início.

---

## 5. CRM operacional legado: como ele aparece na nova arquitetura

`docs/02-arquitetura.md` foca nos 4 módulos do formando (vendas, divulgação, acesso, fotografia). **Mas o legado é maior que isso** — é um CRM operacional + ERP de produção fotográfica. Esta seção cobre o "elefante na sala" que `docs/` ignorou.

### 5.1 Domínios adicionais (pacotes do monorepo)

```
packages/
├── domain-crm/           ← cadastros, pessoas, vendedores, responsáveis, comissões
├── domain-events/        ← turmas, eventos contratados, brindes (já no docs)
├── domain-os/            ← Ordens de Serviço, áreas, tipos, situações (NOVO)
├── domain-billing/       ← contratos, cobranças, parcelas, NFe (expande docs)
├── domain-billing-legacy/← adapter do módulo Nota_fiscal/lista do legado (NOVO, durante coexistência)
├── domain-photos/        ← galerias, créditos, fila editor (já no docs)
├── domain-access/        ← QR, check-in, pulseira (já no docs)
├── domain-comm/          ← campanhas, mensageria, templates, modelos de doc (NOVO)
├── domain-reports/       ← relatórios PDF/XLS (NOVO)
├── shared-db/            ← Prisma schema + migrations
├── shared-ui/            ← design system Ventus
└── shared-types/         ← tipos compartilhados, contratos Zod
```

### 5.2 Mapeamento dos módulos legados aos domínios novos

| Domínio | Engloba do legado |
|---|---|
| `domain-crm` | `/faculdade`, `/curso`, `/usuario`, `/vendedor`, `/responsavel` (+ `responsavel_funcao`), `/Config` (parâmetros, exceto secrets) |
| `domain-events` | `/turma`, `/evento` (catálogo + `evento_turma`), `/brinde` (catálogo + `brinde_turma`), `/cerimonial`, `/produto`, `/produto/tabela`, `/entrega`, `/TipoFotos`, `/status`, `/compromisso` |
| `domain-os` | `/os`, `/os/area_responsavel`, `/os/tipo_os`, `/os/situacao_os` |
| `domain-billing` | Contratos novos + cobranças novas (Asaas) + assinatura ZapSign |
| `domain-billing-legacy` | `/Nota_fiscal/lista` (durante coexistência) |
| `domain-photos` | Status de fotos (legado) + galerias novas + créditos + fila editor |
| `domain-access` | QR + check-in + pulseira (todo novo) |
| `domain-comm` | `/Mensageiro` + `/Modelos` (versionado) + campanhas timed novas |
| `domain-reports` | `/relatorios`, `/relatorios/aluno_brinde`, `/relatorios/aluno_evento`, `/relatorios/beca`, `/relatorios/encarte` + novos relatórios financeiros |

### 5.3 Telas equivalentes (visão geral)

A tabela completa fica em `ETAPA-4-MAPA-FUNCIONALIDADES.md`. Aqui só o resumo de superfície:

| Conjunto | Telas legadas | Telas novas (estimativa) |
|---|---|---|
| Cadastros básicos | 11 | 11 (mesma estrutura, UI moderna) |
| Pessoas | 3 | 3 + portal próprio do vendedor (futuro) |
| Operação | 4 | 4 + dashboards por papel |
| OS | 4 | 4 + automações por gatilho |
| Mensageria/Modelos | 2 | 2 + campanhas timed (4 do `01-visao-projeto.md`) |
| Relatórios | 5 | 5 + 3 novos (financeiro, fotografia, RSVP) |
| Configuração | 3 | 3 + página de integrações com saúde de cada uma |
| Dashboard `/inicial` | 1 | 1 (modernizado com KPIs do legado + novos) |
| **Subtotal CRM legado** | **33** | **~37** |
| **Novos módulos cliente** | 0 | ~25 (portal aluno, portal convidado, portal fotógrafo, portal editor, app check-in) |
| **Total** | **33** | **~62** |

---

## 6. Estrutura de monorepo final

```
formaturas-novo/
├── package.json                  # pnpm workspaces
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .env.example
├── docker-compose.yml            # postgres + redis local
├── .github/workflows/            # CI: lint, typecheck, test, e2e, deploy
├── apps/
│   ├── web/                      # Next.js 15 — todos os portais (admin, aluno, comissão,
│   │                             #   fotógrafo, editor) com layouts segregados por papel
│   ├── api/                      # Fastify — REST API
│   ├── worker-photos/            # BullMQ — Rekognition + Sharp
│   ├── worker-comm/              # BullMQ — Z-API + Resend
│   ├── worker-billing/           # BullMQ — Asaas reconciliation cron
│   └── print-server/             # Node CLI — Zebra ZPL local
├── packages/
│   ├── domain-crm/
│   ├── domain-events/
│   ├── domain-os/
│   ├── domain-billing/
│   ├── domain-billing-legacy/
│   ├── domain-photos/
│   ├── domain-access/
│   ├── domain-comm/
│   ├── domain-reports/
│   ├── shared-db/                # Prisma schema + migrations + seed
│   ├── shared-ui/                # design system Ventus (componentes)
│   ├── shared-types/             # contratos compartilhados (Zod schemas, TS types)
│   ├── shared-auth/              # JWT + magic link + RBAC helpers
│   ├── shared-config/            # carregamento de env via Zod
│   ├── shared-observability/     # Pino + Sentry + PostHog wrappers
│   └── shared-test/              # fixtures + factories (testcontainers)
├── infra/                        # Railway/Vercel configs, Terraform (futuro)
├── docs/                         # docs já existentes (mantidos)
├── tools/
│   ├── etl-legacy/               # script ETL one-shot do MySQL legado
│   └── scripts/                  # utilities (seed, migrate, etc)
└── tests-e2e/                    # Playwright
```

---

## 7. Camadas e fluxo de request

```
Cliente (Next.js)
  │  fetch via TanStack Query (com Idempotency-Key em POST)
  ▼
Edge Vercel  (rate-limit por IP, 100 req/min anônimo, 1000/min autenticado)
  │  reverse proxy
  ▼
Fastify API
  │  preHandler 1: parse JWT → resolve userId, tenantId, role
  │  preHandler 2: SET LOCAL app.tenant_id = ... (RLS)
  │  preHandler 3: RBAC check (recurso × ação × papel)
  │  preHandler 4: Idempotency-Key → tabela idempotency_keys
  │  preHandler 5: Zod parse de body/params/query
  │  handler: chama serviço de domain-X
  │  domain layer (puro TS, sem Fastify) → Prisma
  │  postHandler: log estruturado + audit_log se mutação
  ▼
Postgres (RLS) ─ Redis (cache + fila) ─ R2 (storage) ─ Externos (Asaas, Z-API, Rekognition)
```

**Princípio:** controllers Fastify são **finos** — toda lógica fica em `packages/domain-*`. Isso permite testar domínio sem subir API e migrar para Hono/NestJS no futuro com custo baixo.

---

## 8. Auth, RBAC, multi-tenant

### 8.1 Fluxos de autenticação

| Persona | Fluxo |
|---|---|
| Admin Ventus | email + senha (argon2) + 2FA TOTP opcional |
| Operador interno (financeiro, cerimonial, etc) | mesmo do admin |
| Vendedor | mesmo do admin (futuramente WhatsApp magic link) |
| Fotógrafo | email + senha |
| Editor | email + senha |
| Operador de evento (portaria) | login no tablet com código curto + PIN (não email) |
| Comissão (formandos representantes) | WhatsApp magic link |
| Formando | WhatsApp magic link |
| Convidado | sem login — token único no QR (validade do evento) |

### 8.2 JWT
- HS256, 7 dias, refresh por presence (cookie `httpOnly`, `Secure`, `SameSite=Strict`).
- Claims: `{ sub: userId, tenantId, role, perms[], iat, exp, jti }`.
- `jti` permite blacklist em logout (cache Redis).

### 8.3 RBAC: matriz de permissões

Notação: `recurso.acao` (ex: `turma.read`, `cobranca.write`, `os.assign`).

| Persona / Recurso | turmas | formandos | contratos | cobranças | OS | galerias | fotos | convidados | check-ins | reports | tenant config |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `ADMIN_TENANT` | * | * | * | * | * | * | * | * | * | * | * |
| `OPERADOR_FINANCEIRO` | read | read | * | * | read,assign | read | read | read | read | read | — |
| `OPERADOR_COMERCIAL` | * | * | * | read | read,create | read | read | read | read | read | — |
| `OPERADOR_CERIMONIAL` | read | read | read | read | * (área cerimonial) | read | read | * | * | read | — |
| `OPERADOR_ADMIN` | read | read | read | read | * | read | read | read | read | read | — |
| `OPERADOR_QUALIDADE` | read | read | read | read | * (área qualidade) | read | read | read | read | read | — |
| `VENDEDOR` | own | own (own turmas) | own | own | own | — | — | — | — | own | — |
| `FOTOGRAFO` | assigned | assigned | — | — | own (área edição) | * (assigned) | upload,read | — | — | own | — |
| `EDITOR` | assigned | assigned | — | — | own (área edição) | read | edit,upload | — | — | — | — |
| `OPERADOR_EVENTO` | read (assigned) | read (assigned turma) | — | — | — | — | — | * (assigned) | * (assigned) | — | — |
| `COMISSAO` | own (própria) | own | — | — | open (própria) | own | read | * (own turma) | own | — | — |
| `FORMANDO` | own | own self | own | own self | open (own) | own (filtered self) | own self | own (limited cota) | own | — | — |
| `CONVIDADO` | — | — | — | — | — | — | — | own (token-scoped) | own (own) | — | — |

`*` = todas as ações. `own` = restrito ao próprio escopo (turma, formando, ID). `assigned` = às turmas/recursos atribuídos. `open` = pode abrir/criar mas não fechar/aprovar.

### 8.4 Multi-tenant
- Toda query passa pelo middleware que faz `SET LOCAL app.tenant_id = $tenant_id` na transação.
- Tabelas têm RLS:
  ```sql
  CREATE POLICY tenant_isolation_turmas ON turmas
    USING (tenant_id = current_setting('app.tenant_id')::uuid);
  ```
- Catálogos globais (`evento_catalogo` se compartilhado, `pais`, `estados`) ficam fora do RLS.
- Para o MVP, **único tenant é Ventus**, mas RLS já é ligado.

---

## 9. Workers, filas, agendamentos

| Fila | Worker | Concurrency | Retry | Cron |
|---|---|---|---|---|
| `photos-face` | `worker-photos` | 4 (autoscale) | exp: 1s, 5s, 30s, 5m, 30m (max 5) | — |
| `photos-thumbs` | `worker-photos` | 8 | mesma | — |
| `comm-whatsapp` | `worker-comm` | 4 | mesma | — |
| `comm-email` | `worker-comm` | 4 | mesma | — |
| `comm-campaigns` | `worker-comm` | 2 | mesma | — |
| `billing-recon` | `worker-billing` | 1 | linear (60s × 3) | diário 09:00 |
| `billing-reminders` | `worker-billing` | 2 | exp | diário 08:00 (D-7, D-3, D0, D+3, D+15) |
| `reports-export` | `worker-comm` (renomear depois) | 2 | exp | sob demanda |
| `print-jobs` | `print-server` (local) | 1 (FIFO) | infinito | — |
| `audit-archive` | `worker-billing` | 1 | linear | semanal (compacta logs >90d) |

**Idempotência:** chave `(tenantId, entityId, action)` com TTL 24h. Worker checa antes de executar.

**Dead-letter:** após 5 falhas, vai para `*-dlq`. Sentry captura e cria ticket.

---

## 10. Integrações externas (consolidação)

| Provider | Camada | Webhook? | Auth | Observação |
|---|---|---|---|---|
| **Asaas** | `domain-billing` adapter | Sim — `/webhooks/asaas` | `access_token` | Eventos: `PAYMENT_CONFIRMED`, `RECEIVED`, `OVERDUE`, `REFUNDED` |
| **ZapSign** | `domain-billing` adapter | Sim (opcional) | `api_token` | Documentos assinados retornam URL final |
| **Z-API** | `domain-comm` adapter (`MessagerAdapter`) | Sim — `/webhooks/zapi` | `instance_id` + `token` + `clientToken` | Status: `delivered`, `read`. Templates Meta-aprovados |
| **AWS Rekognition** | `domain-photos` adapter | Não | IAM | Coleção `turma-${turmaId}`, threshold 80, MaxFaces 100 |
| **Cloudflare R2** | shared infra (S3-compat) | Não | Access Key | Presigned URL 15min, lifecycle 365d |
| **Resend** | `domain-comm` adapter (`EmailAdapter`) | Sim (delivery events) | API key | Free 3000/mês |
| **NFe (TBD)** | `domain-billing` `INFeAdapter` | depende | depende | Não migrar na Fase 1 |
| **Mensageiro legado** | `domain-comm` `LegacyMessagerAdapter` | Não | sessão CI | Só durante coexistência |

**Princípio:** todas as integrações ficam atrás de adapters em `domain-*`. Trocar Asaas por Pagar.me ou Z-API por Meta Cloud API muda 1 arquivo, não 50.

---

## 11. Observabilidade

### 11.1 Logs (Pino estruturado)
Campos obrigatórios em todo log: `traceId`, `tenantId`, `userId`, `route`, `method`, `status`, `latencyMs`. Output JSON em produção, pretty em dev.

### 11.2 Métricas de negócio (PostHog)
Eventos:
- `formando.onboarded`, `formando.foto_referencia_uploaded`
- `contrato.assinado`, `cobranca.paga`, `cobranca.atrasada`
- `foto.uploaded`, `foto.processada`, `foto.selecionada`, `foto.entregue`
- `convidado.convidado`, `convidado.confirmou`, `convidado.checkin`
- `os.criada`, `os.fechada`, `os.atrasada`

Funis pré-configurados:
- Funil de pagamento (link → contrato → 1ª parcela → 2ª parcela)
- Funil de foto (upload → processada → notificada → selecionada → entregue)
- Funil de RSVP (convite → aberto → confirmado → check-in)

### 11.3 Erros (Sentry)
Front + back. Source maps em produção. Release tracking.

### 11.4 Métricas técnicas (Grafana / Better Stack)
- p50/p95/p99 por rota.
- Tamanho de fila por worker.
- Taxa de erro por integração externa.
- Conexões ativas no Postgres.

### 11.5 Alertas (PagerDuty ou Better Stack)
Severidades:
- **P1** (acorda alguém): API caída >5min, fila `comm-whatsapp` >1000 itens, Asaas webhook falhando >15min.
- **P2** (notifica em horário comercial): p95 > 1s por 30min, fila `photos-face` >200, taxa de erro >5%.
- **P3** (relatório diário): outros desvios.

---

## 12. Segurança

### 12.1 Mitigações vs riscos da Etapa 1 §11

| # | Risco | Mitigação no novo |
|---|---|---|
| 1 | CSRF | Cookies `SameSite=Strict` + double-submit token em forms tradicionais |
| 2 | XSS | React escape default + CSP estrita (nonce) + `dangerouslySetInnerHTML` proibido por lint |
| 3 | SQL injection | Prisma — sem queries raw exceto views. Lint proibindo `$queryRaw` |
| 4 | Senhas fracas | Argon2id, mínimo 12 caracteres, deny breached (HIBP API) |
| 5 | Cookies de sessão sem flags | JWT em cookie `httpOnly + Secure + SameSite=Strict + Domain restrito` |
| 6 | Sem 2FA | TOTP opcional para admin/operador, obrigatório para `ADMIN_TENANT` |
| 7 | Secrets em colunas | Resolvido em §2.6 |
| 8 | Sem audit log | Resolvido em ADR-011 |
| 9 | Sem rate limit | Fastify rate-limit plugin: 100/min anon, 1000/min auth, 10/min em endpoints sensíveis (`/auth`, `/webhooks`) |
| 10 | Permissões por menu bypass-áveis | RBAC server-side em todo handler. Esconder no front é UX, autorização real no back |
| 11 | LGPD sem consentimento | Onboarding obrigatório com 2 aceites separados (dados pessoais + biometria), tabela `lgpd_eventos` |
| 12 | Backup desconhecido | Supabase tem PITR (Point-In-Time Recovery) 7 dias no plano Pro. Backup adicional para R2 com pg_dump diário |

### 12.2 Hardening adicional
- Helmet headers (CSP, HSTS, X-Frame-Options).
- DDoS na Cloudflare (bot fight mode).
- Dependabot + npm audit em CI bloqueante para vulnerabilidades High/Critical.
- Secrets nunca em commit (gitleaks no pre-commit).
- Pen-test antes do go-live (orçamento separado).

### 12.3 LGPD operacional
- Tela de privacidade no portal do formando: "Meus dados", botão "Exportar JSON", botão "Pedir esquecimento".
- Job assíncrono de esquecimento: anonimiza PII, mantém ID, mantém financeiro com PII anonimizada (CDC), apaga embedding biométrico imediatamente.
- Log em `lgpd_eventos` de cada operação.

---

## 13. Estratégia de migração e cutover

### 13.1 Fase 0 — Preparação (~2 sem)
- Setup do monorepo, CI/CD, Supabase, Railway, R2.
- Schema Prisma da Etapa 3 aplicado.
- Seed mínimo (`Tenant: Ventus`, usuários internos, áreas OS, status de fotos).
- Conexão read-only ao MySQL legado para o ETL.

### 13.2 Fase 1 — ETL "shadow" (~2 sem)
- Script `tools/etl-legacy/` lê MySQL → escreve Postgres novo.
- Cada entidade ganha `legacyId text` (ex: `'turma:0042'`).
- Diário: re-rodar ETL, comparar contagens, alertar divergências.
- **Nada operacional muda no legado** — só leitura.

### 13.3 Fase 2 — Construção dos módulos (~3-4 meses, time SENAI)
Ordem sugerida (ajusta `docs/04-roadmap-mvp.md`):
1. CRM operacional + Dashboard (dá paridade funcional com o legado).
2. Portal do formando + Asaas (gera valor visível ao cliente final).
3. Fotografia + Rekognition (diferencial competitivo).
4. RSVP + Convidados.
5. Check-in + Pulseira.

### 13.4 Fase 3 — Cutover por turma (~2 meses, faseado)
- Turma piloto: comissão treinada + suporte direto Ventus.
- Toda turma migrada vira read-only no legado (lock administrativo).
- KPIs de cutover: zero incidentes financeiros, zero perda de OS, NPS ≥ 60.
- Janela: 1 turma/semana inicialmente, escalando para 2-3.

### 13.5 Fase 4 — Desligamento do legado (~1 mês)
- Última turma migrada → legado vira só "histórico" (read-only).
- Após 6 meses sem acesso, exporta para arquivo morto S3 Glacier e desliga servidor.

---

## 14. Custos estimados (MVP, 1 tenant Ventus, 5-10 turmas ativas)

| Item | Provider | Custo mensal |
|---|---|---|
| Web (Next.js) | Vercel Hobby/Pro | R$ 0 a R$ 100 |
| API + Workers | Railway | R$ 100-200 |
| Postgres | Supabase Pro | R$ 125 |
| Redis | Upstash Pay-as-go | R$ 25-50 |
| Storage | Cloudflare R2 | R$ 5-15 |
| WhatsApp | Z-API | R$ 100-300 (por volume) |
| Email | Resend | R$ 0 (free 3000/mês) |
| Reconhecimento facial | AWS Rekognition | R$ 50-150 (por volume) |
| Pagamento | Asaas | 0 fixo + taxa por transação |
| Assinatura | ZapSign | conforme contrato Ventus |
| Sentry | Sentry | R$ 0 (free) |
| PostHog | PostHog Cloud | R$ 0 (free) |
| Grafana | Grafana Cloud | R$ 0 (free) |
| **TOTAL infra** | | **R$ 400-1.000** |

> **Não inclui:** time de desenvolvimento, hardware Zebra (R$ 4.500-7.500 ou R$ 200/dia aluguel), custo de migração ETL, pen-test, conta Meta Business para templates.

---

## 15. Pendências para o cliente (Ventus)

Para destravar a Etapa 5 (construção real), Ventus precisa:

| # | Item | Quem responde | Bloqueio |
|---|---|---|---|
| 1 | Dump SQL real do MySQL legado | RPSys (fornecedor) | Etapa 3 final + ETL |
| 2 | Lista de todos endpoints AJAX usados (DevTools Network durante uso) | Equipe Ventus | Cobertura do CRM no novo |
| 3 | Identificar provider do "Mensageiro" e do "Kentro" | Elison + RPSys | Adapter correto na Fase 1 |
| 4 | URL exata da "Sala de Entretenimento" | Elison (capturar do Chrome) | Inclusão no mapa |
| 5 | Existe portal `ventus_novo` em uso? | RPSys | Decidir se aproveita parte |
| 6 | Templates WhatsApp para submeter à Meta (10 templates listados) | Marketing Ventus + Z-API | Módulo 2/4 |
| 7 | Conta Meta Business verificada | Ventus | Requisito Z-API templates |
| 8 | Hardware Zebra (compra ou aluguel) para o piloto | Diretoria | Módulo 3 |
| 9 | LGPD: aceite jurídico do consentimento biométrico | Jurídico Ventus | Módulo 4 |
| 10 | Domínio do produto (subdomínio `app.ventusformaturas.com.br`?) | Elison | Deploy |
| 11 | Identidade visual final (tipografia, ícones, ilustrações) | Designer | Design system |
| 12 | Política de backup atual + restore testado | RPSys | Risk assessment |
| 13 | Decidir se acumula multi-tenant white-label desde o MVP ou só Ventus | Estratégia Ventus | Não bloqueia técnico (já é multi-tenant lógico), mas afeta marketing |

---

**Status:** Etapa 2 concluída.
**Próxima:** Etapa 3 — Estrutura de banco otimizada.
