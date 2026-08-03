# Ventus Backend

Backend Node.js + Express + PostgreSQL + Prisma para o ecossistema Ventus Formaturas.

**Status atual:**
- Módulo 1 — **Google Ads Tracking** ✅ implementado e testado
- Módulo 2 — **RCS multi-provider** ✅ implementado e testado (5 providers: generic_http + Zenvia/Pontaltech/Infobip/TakeBlip)
- Módulo 3 — **E-mail multi-provider** ✅ implementado e testado (4 providers: SMTP/SendGrid/Amazon SES/Generic HTTP) + templates com variáveis e anexos + supressão automática

Próximos módulos do roadmap: Telefonia · Motor de Campanha · Login.

> O frontend HTML estático em `../novo-sistema-html/` continua servindo como protótipo visual e pode (será) configurado para consumir os endpoints deste backend.

## Stack

| Camada | Escolha | Por quê |
|---|---|---|
| Runtime | Node.js 20+ (ESM) | LTS, suporte nativo a `--watch` |
| HTTP | Express 4 | Maduro, padrão do mercado |
| ORM | Prisma 5 | Type-safe, migrations versionadas |
| DB | PostgreSQL 14+ | Requisito do brief |
| Auth | JWT (`jsonwebtoken`) | Stateless |
| Fila | pg-boss | Usa o próprio Postgres como backing store — sem Redis extra |
| SDK Google | `google-ads-api` (npm) | Cliente oficial não-Google mais usado |
| Validação | Zod | Inferência de tipos + parsing |
| Logs | Pino + pino-http | Estruturado e rápido (com redaction de segredos) |
| Testes | Jest 29 + Supertest | Padrão Node |

## Instalação

```bash
cd backend
npm install
cp .env.example .env
# preencha .env com seu DATABASE_URL e JWT_SECRET
```

Gere um `JWT_SECRET` real:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Banco de dados

Suba um Postgres local (Docker é o caminho mais rápido):
```bash
docker run --name ventus-pg -e POSTGRES_USER=ventus -e POSTGRES_PASSWORD=changeme -e POSTGRES_DB=ventus -p 5432:5432 -d postgres:16
```

Aplique o schema:
```bash
npm run prisma:migrate
# Esta primeira vez vai pedir um nome para a migration. Sugestão: "init"
```

### Rodar

```bash
# API HTTP (terminal 1)
npm run dev

# Worker de retry (terminal 2)
npm run worker
```

Healthcheck: `curl http://localhost:4000/health` → `{ status: "ok", uptime: ... }`

### Testes

```bash
npm test                # todos
npm run test:unit       # puros, sem PG
npm run test:integration # mocka Prisma e SDK do Google
```

Os testes unitários (33) e de integração de "no fake success" (5) **rodam sem Postgres nem Google Ads configurados**. Testes que precisarem de DB real virão em iterações futuras.

## Configurar Google Ads

Você precisa de:

1. **Conta Google Ads** com acesso ao Customer ID que vai receber as conversões.
2. **Developer Token** aprovado em https://ads.google.com/aw/apicenter (em conta MCC).
3. **OAuth Client ID + Secret** criado em https://console.cloud.google.com → APIs & Services → Credentials.
4. **Refresh Token** gerado em https://developers.google.com/google-ads/api/docs/oauth/playground com escopo `https://www.googleapis.com/auth/adwords`.
5. **Conversion Action ID** — crie a conversion action no painel do Google Ads e capture o ID.

Coloque tudo em `.env` OU envie via `POST /api/google-ads/config` (validado por Zod).

### Modos de upload suportados

| Modo | Quando usar | Obrigatório |
|---|---|---|
| `offline_click_conversion` | Você tem GCLID (vindo do `?gclid=` da URL do anúncio) | gclid OR gbraid OR wbraid |
| `enhanced_conversions_for_leads` | Não tem click ID, mas tem first-party data (email/telefone do lead) | user_identifiers (hasheados SHA-256) |
| `data_manager_api` | Roadmap futuro do Google — placeholder explícito que retorna 501 | n/a |

## Endpoints

| Módulo | Documentação |
|---|---|
| Google Ads Tracking (7 endpoints) | [`docs/google-ads.md`](docs/google-ads.md) |
| RCS multi-provider (12 endpoints) | [`docs/rcs.md`](docs/rcs.md) |
| E-mail multi-provider (16 endpoints) | [`docs/email.md`](docs/email.md) |

## Estrutura

```
backend/
├── prisma/schema.prisma           # 5 modelos: TrackingSession, LeadAttribution, GoogleAdsCredential, GoogleAdsConversion, GoogleAdsConversionLog
├── src/
│   ├── config/{env,logger}.js     # zod-validated env + pino com redaction de segredos
│   ├── db/prisma.js               # singleton PrismaClient
│   ├── middleware/                # auth (JWT), error handler, capture (gclid/utm)
│   ├── services/                  # google-ads, credentials, tracking
│   ├── controllers/               # google-ads
│   ├── routes/                    # google-ads, tracking
│   ├── validators/                # schemas Zod
│   ├── utils/                     # crypto (SHA-256 + normalização), dedup
│   ├── workers/retry.worker.js    # pg-boss
│   ├── app.js                     # composer
│   └── server.js                  # bootstrap
└── tests/
    ├── unit/                      # crypto, dedup, capture, validators (sem PG)
    └── integration/               # no-fake-success (mocka Prisma)
```

## Garantias do brief

- ✅ **Zero `simulated:true` / `mock:true` / fake success.** Sem credenciais, todo endpoint que precisa do Google retorna `503 google_ads_credentials_missing`.
- ✅ **Logs técnicos para auditoria.** Toda tentativa cria uma linha em `google_ads_conversion_logs` com `raw_request`, `raw_response`, `error_message`, `error_code`, `duration_ms`.
- ✅ **Deduplicação determinística.** SHA-256 de `(leadId|orderId)+evento+action_id+dia_UTC` em coluna `unique` — UPSERT em vez de checagem prévia (evita race).
- ✅ **Retry automático.** 5min/30min/2h/6h/24h, máximo 5 tentativas, agendamento via pg-boss.
- ✅ **Hashing first-party correto.** Email/telefone/nome normalizados antes do SHA-256 conforme spec do Google.
- ✅ **Status real no dashboard.** `GET /status` agrega contagem por status, taxa de sucesso, último envio, último erro, status da conexão.

## Segurança

- Headers via Helmet
- Rate limit 240 req/min/IP em `/api/*`
- JWT obrigatório em `/api/google-ads/*`
- Pino redaction remove `authorization`, `password`, `refresh_token`, `developer_token`, `client_secret` dos logs
- Express body limit 512KB

## Próximos passos do roadmap (mesmo padrão)

1. **RCS** — service idempotente, fila de envio, dashboard de delivery
2. **E-mail** — provider abstraction (Resend/SES/SMTP), bounce handling
3. **Telefonia** — webhook de chamadas, vínculo com lead_attribution para conversões `phone_call`
4. **Motor de campanha** — orquestração cron + webhook das campanhas que hoje vivem no protótipo
5. **Login multi-empresa** — substitui os logins hardcoded atuais por DB real
