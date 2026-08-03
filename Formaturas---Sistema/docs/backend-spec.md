# Backend Spec — Para Time SENAI

> **Audiência:** time SENAI especializado em banco de dados, performance e big data.
> **Premissa metodológica:** front-end já chega gerado por IA com tipos TS prontos. Time backend recebe documentação e **executa a implementação**.

---

## 1. Stack obrigatório

```
Node.js 20 LTS
TypeScript (strict)
Fastify 4.x          ← framework HTTP
Prisma 5.x           ← ORM Postgres
Zod                  ← validação de inputs
BullMQ + Redis       ← filas
Pino                 ← logging estruturado
Vitest               ← testes
pnpm                 ← gerenciador (monorepo workspaces)
```

**Não usar:** Express (legado), Sequelize (Prisma é melhor), Jest (Vitest é mais rápido).

---

## 2. Estrutura de pastas

```
apps/api/
├── src/
│   ├── server.ts                # bootstrap Fastify
│   ├── config/                  # env, secrets
│   ├── plugins/                 # plugins Fastify (auth, db, redis)
│   ├── routes/                  # rotas REST
│   │   ├── auth/
│   │   ├── tenants/
│   │   ├── turmas/
│   │   ├── pacotes/
│   │   ├── contratos/
│   │   ├── cobrancas/
│   │   ├── eventos/
│   │   ├── convidados/
│   │   ├── checkins/
│   │   ├── galerias/
│   │   ├── fotos/
│   │   ├── selecoes/
│   │   ├── webhooks/            # Asaas, Z-API
│   │   └── admin/
│   ├── services/                # lógica de negócio (não tem HTTP)
│   ├── middleware/              # auth, tenant resolution, error handling
│   ├── lib/                     # helpers (qr, hash, format)
│   └── types/                   # tipos compartilhados
├── prisma/
│   ├── schema.prisma            # ver docs/03-modelo-dados.md
│   └── migrations/
└── tests/
    ├── unit/
    └── integration/
```

---

## 3. Convenções de API REST

### URL Pattern
```
/api/v1/{recurso}/{id}/{sub-recurso}
```

Exemplos:
- `GET    /api/v1/turmas`
- `GET    /api/v1/turmas/:id`
- `POST   /api/v1/turmas`
- `PATCH  /api/v1/turmas/:id`
- `DELETE /api/v1/turmas/:id`
- `GET    /api/v1/turmas/:id/formandos`
- `POST   /api/v1/turmas/:id/formandos`

### Headers obrigatórios
```
Authorization: Bearer <jwt>
X-Tenant-Slug: ventus            ← resolve tenant automaticamente
Content-Type: application/json
Idempotency-Key: <uuid>          ← em POST/PATCH (opcional, recomendado)
```

### Resposta padrão

```json
// Sucesso (200/201)
{
  "data": { ... },
  "meta": { "tenant": "ventus", "timestamp": "..." }
}

// Lista (200)
{
  "data": [ ... ],
  "meta": {
    "total": 142,
    "page": 1,
    "perPage": 20,
    "totalPages": 8
  }
}

// Erro (4xx/5xx)
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email inválido",
    "details": { "field": "email" }
  }
}
```

### Códigos HTTP
- `200 OK` — leitura ou update
- `201 Created` — criação
- `204 No Content` — delete
- `400 Bad Request` — validação Zod falhou
- `401 Unauthorized` — sem auth
- `403 Forbidden` — sem permissão
- `404 Not Found` — recurso não existe
- `409 Conflict` — conflito (ex: telefone já cadastrado)
- `422 Unprocessable Entity` — regra de negócio violada
- `429 Too Many Requests` — rate limit
- `500 Internal Server Error` — bug
- `503 Service Unavailable` — integração externa fora

---

## 4. Endpoints do MVP (Fase 1 — Foto)

> Lista resumida. Spec completa em formato OpenAPI deve ser gerada como output do desenvolvimento.

### Auth

| Método | Endpoint | Descrição |
|---|---|---|
| POST | `/api/v1/auth/magic-link` | Solicita magic link via WhatsApp/email |
| POST | `/api/v1/auth/verify` | Valida token e retorna JWT |
| POST | `/api/v1/auth/logout` | Invalida sessão |
| GET  | `/api/v1/auth/me` | Dados do usuário logado |

### Tenant / Configuração

| Método | Endpoint | Descrição |
|---|---|---|
| GET  | `/api/v1/tenants/me` | Dados do tenant atual (cores, logo) |

### Turmas e Formandos

| Método | Endpoint | Descrição |
|---|---|---|
| GET  | `/api/v1/turmas` | Lista turmas |
| POST | `/api/v1/turmas` | Cria turma |
| GET  | `/api/v1/turmas/:id` | Detalhe |
| PATCH| `/api/v1/turmas/:id` | Edita |
| GET  | `/api/v1/turmas/:id/formandos` | Lista formandos da turma |
| POST | `/api/v1/turmas/:id/formandos` | Adiciona formando |
| GET  | `/api/v1/formandos/:id` | Detalhe do formando |
| PATCH| `/api/v1/formandos/:id` | Edita formando |
| POST | `/api/v1/formandos/:id/foto-referencia` | Upload foto biométrica |

### Eventos e Galerias

| Método | Endpoint | Descrição |
|---|---|---|
| GET  | `/api/v1/eventos` | Lista (filtro por turma) |
| POST | `/api/v1/eventos` | Cria evento |
| GET  | `/api/v1/eventos/:id/galerias` | Lista galerias |
| POST | `/api/v1/eventos/:id/galerias` | Cria galeria |

### Fotos

| Método | Endpoint | Descrição |
|---|---|---|
| POST | `/api/v1/fotos/presigned-url` | Gera URL de upload R2 |
| POST | `/api/v1/fotos/registrar` | Registra metadata após upload |
| GET  | `/api/v1/fotos?galeriaId=` | Lista fotos da galeria |
| GET  | `/api/v1/formandos/:id/fotos` | **Galeria personalizada** (com face match) |
| GET  | `/api/v1/fotos/:id` | Detalhe |
| DELETE | `/api/v1/fotos/:id` | Remove (soft) |

### Seleção e Edição

| Método | Endpoint | Descrição |
|---|---|---|
| POST | `/api/v1/formandos/:id/selecoes` | Adiciona foto à seleção |
| DELETE | `/api/v1/selecoes/:id` | Remove da seleção |
| POST | `/api/v1/formandos/:id/selecoes/finalizar` | Finaliza e envia para fila de edição |
| GET  | `/api/v1/editor/fila` | Editor: pacotes para editar |
| POST | `/api/v1/editor/pegar-pacote` | Editor pega lote |
| POST | `/api/v1/editor/upload-finalizada` | Editor upload da versão pronta |
| POST | `/api/v1/editor/finalizar-pacote` | Marca pacote como pronto |

### Webhooks

| Método | Endpoint | Descrição |
|---|---|---|
| POST | `/api/v1/webhooks/asaas` | Recebe eventos de pagamento |
| POST | `/api/v1/webhooks/zapi` | Recebe status de mensagem WhatsApp |

---

## 5. Validação com Zod

**Toda rota tem schema Zod** para body, query e params:

```typescript
// Exemplo: criar turma
const createTurmaSchema = z.object({
  nome: z.string().min(3).max(120),
  faculdade: z.string().min(2),
  curso: z.string().min(2),
  anoSemestre: z.string().regex(/^\d{4}\/[12]$/), // "2026/2"
  capaUrl: z.string().url().optional(),
});

// Em fastify
fastify.post('/turmas', {
  schema: { body: zodToJsonSchema(createTurmaSchema) }
}, async (request, reply) => {
  const data = createTurmaSchema.parse(request.body);
  // ...
});
```

---

## 6. Filas (BullMQ + Redis)

### Filas necessárias

```typescript
// 1. Processamento facial (face match com Rekognition)
photosFaceQueue: {
  name: 'photos-face',
  jobs: ProcessPhotoFaceJob[]
}

// 2. Geração de thumbnails
photosThumbsQueue: {
  name: 'photos-thumbs',
  jobs: GenerateThumbJob[]
}

// 3. Comunicação WhatsApp
commWhatsappQueue: {
  name: 'comm-whatsapp',
  jobs: SendWhatsappJob[]
}

// 4. Cobrança scheduled
billingQueue: {
  name: 'billing',
  jobs: BillingTickJob[]  // tick diário às 09h
}

// 5. Impressão de pulseira
printQueue: {
  name: 'print',
  jobs: PrintWristbandJob[]
}
```

### Workers

```
apps/worker-photos/   → consome photosFaceQueue + photosThumbsQueue
apps/worker-comm/     → consome commWhatsappQueue
apps/worker-billing/  → consome billingQueue (cron diário)
apps/print-server/    → consome printQueue (rodando local no evento)
```

### Retry policy
- Exponential backoff: 1s, 5s, 30s, 5min, 30min
- Máx 5 tentativas
- Após 5 falhas → vai para `dead-letter` queue + alerta no Sentry

### Idempotência
- Job key = hash de `(tenantId, entityId, action)` → previne duplicação
- Webhooks usam Idempotency-Key do header

---

## 7. Integrações Detalhadas

### 7.1 Asaas (Pagamento)

**Auth:** API key em variável `ASAAS_API_KEY`

**Endpoints chave:**

```typescript
// Criar cliente
POST https://api.asaas.com/v3/customers
Headers: { access_token: ASAAS_API_KEY }
Body: { name, cpfCnpj, email, mobilePhone }
Response: { id: "cus_xxxxx" }

// Criar cobrança
POST https://api.asaas.com/v3/payments
Body: {
  customer: "cus_xxxxx",
  billingType: "PIX" | "BOLETO" | "CREDIT_CARD" | "UNDEFINED",
  value: 250.00,
  dueDate: "2026-06-15",
  installmentCount: 12,
  description: "Parcela 3/12 - Formatura Enfermagem FIP",
  externalReference: "<contratoId>"
}
Response: { id: "pay_xxxxx", invoiceUrl: "https://..." }

// Webhook URL configurar no painel Asaas:
POST https://api.ventus.com.br/api/v1/webhooks/asaas
Eventos: PAYMENT_CONFIRMED, PAYMENT_RECEIVED, PAYMENT_OVERDUE, PAYMENT_REFUNDED
```

**Documentação oficial:** https://docs.asaas.com/

---

### 7.2 Z-API (WhatsApp)

**Auth:** instance ID + token + client-token (3 valores)

**Endpoints chave:**

```typescript
// Enviar mensagem com imagem
POST https://api.z-api.io/instances/{instanceId}/token/{token}/send-image
Headers: { Client-Token: clientToken }
Body: {
  phone: "5538999999999",
  image: "https://link-da-foto.com/preview.jpg",
  caption: "Olá João! Suas fotos estão prontas! 🎉\n\nClique aqui: [LINK]"
}

// Enviar template aprovado pela Meta (preferível)
POST https://api.z-api.io/instances/{instanceId}/token/{token}/send-text-template
Body: {
  phone: "...",
  templateName: "fotos_finalizadas",
  parameters: ["João", "47", "https://link..."]
}

// Webhook configurar:
POST https://api.ventus.com.br/api/v1/webhooks/zapi
Eventos: MessageStatusCallback (delivered, read)
```

**Documentação:** https://developer.z-api.io/

---

### 7.3 AWS Rekognition (Face Match)

**Auth:** AWS Access Key + Secret + Region (us-east-1 ou sa-east-1)

**Operações:**

```typescript
// 1. Criar coleção (1x por turma)
const collection = await rekognition.createCollection({
  CollectionId: `turma-${turmaId}`
});

// 2. Indexar formando (após upload da foto referência)
const indexed = await rekognition.indexFaces({
  CollectionId: `turma-${turmaId}`,
  Image: { S3Object: { Bucket: 'ventus-fotos', Name: 'ref/formando-X.jpg' } },
  ExternalImageId: formandoId,  // mapping
  MaxFaces: 1
});
// salvar embedding de retorno na tabela formandos.embeddingFacial

// 3. Buscar matches em foto nova
const result = await rekognition.searchFacesByImage({
  CollectionId: `turma-${turmaId}`,
  Image: { S3Object: { Bucket: 'ventus-fotos', Name: 'evento/foto-N.jpg' } },
  FaceMatchThreshold: 80,
  MaxFaces: 100  // várias pessoas em uma foto
});
// para cada match → criar registro fotos_formandos
```

**Documentação:** https://docs.aws.amazon.com/rekognition/

**Estimativa de custo:**
- IndexFaces: $0.001 por imagem
- SearchFacesByImage: $0.001 por busca
- Storage de coleção: ~$0.01 por 1000 faces/mês

---

### 7.4 Cloudflare R2 (Storage)

**Auth:** Access Key + Secret (S3-compatible)

**Operações:**

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const r2 = new S3Client({
  endpoint: 'https://<accountId>.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: { accessKeyId, secretAccessKey }
});

// Gerar URL de upload (presigned, 15min de validade)
const command = new PutObjectCommand({
  Bucket: 'ventus-fotos',
  Key: `${tenantId}/${eventoId}/${fileName}`,
  ContentType: 'image/jpeg'
});
const url = await getSignedUrl(r2, command, { expiresIn: 900 });
// front-end faz PUT direto no URL retornado
```

**Custo:**
- Storage: $0.015/GB/mês
- Operações Class A (write): $4.50 por 1M
- Operações Class B (read): $0.36 por 1M
- **Egress: $0** ← diferencial

---

### 7.5 Print Server Local (Zebra ZPL)

Daemon Node.js rodando no PC local da portaria do evento.

```typescript
import { Worker } from 'bullmq';
import { SerialPort } from 'serialport'; // ou USB direto
import { execSync } from 'child_process';

const worker = new Worker('print', async (job) => {
  const { nome, qrToken, categoria } = job.data;
  
  const zpl = `
^XA
^FO50,50^A0N,50,50^FD${nome}^FS
^FO50,150^BQN,2,5^FDQA,${qrToken}^FS
^FO50,400^A0N,30,30^FD${categoria}^FS
^XZ
  `;
  
  // Envia via lp (CUPS) ou direct USB
  execSync(`echo "${zpl}" | lp -d Zebra_ZD510`);
  
  return { printed: true };
}, {
  connection: { host: 'localhost', port: 6379 }  // Redis local cache
});
```

**Cache offline:** SQLite local sincronizado com API antes do evento.

---

## 8. Auth e Multi-tenancy

### Fluxo Auth

```
1. Usuário entra com telefone/email
2. Sistema gera magic-link token (UUID + expira 15min)
3. Sistema envia link via WhatsApp/email
4. Usuário clica → link tem token na URL
5. Sistema valida token, retorna JWT (HS256, expira 7 dias)
6. JWT contém: { userId, tenantId, tipo, exp }
```

### Middleware de tenant

```typescript
// Plugin Fastify
fastify.addHook('preHandler', async (request) => {
  const tenantSlug = request.headers['x-tenant-slug'] as string;
  if (!tenantSlug) throw new Error('X-Tenant-Slug header required');
  
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) throw new Error('Tenant not found');
  
  request.tenantId = tenant.id;
  
  // Set RLS no Postgres
  await prisma.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenant.id}'`);
});
```

### Roles e permissões

```typescript
// RBAC simples por tipo de usuário
const PERMISSIONS = {
  ADMIN_TENANT: ['*'],
  COMISSAO: ['turma.read', 'convidados.manage', 'comunicacao.send'],
  FORMANDO: ['perfil.manage', 'fotos.read', 'selecoes.manage'],
  FOTOGRAFO: ['fotos.upload', 'galerias.manage'],
  EDITOR: ['selecoes.edit', 'fotos.upload'],
  OPERADOR: ['checkins.create', 'pulseiras.print']
};
```

---

## 9. Observabilidade

### Logging
```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: ['req.headers.authorization', 'req.body.password'],
  formatters: {
    level: (label) => ({ level: label })
  }
});

// Em toda rota:
logger.info({ tenantId, userId, action: 'turma.create', turmaId }, 'Turma created');
```

### Tracing
- Cada request gera `request-id` propagado em headers
- Logs estruturados em JSON → enviados para Sentry/Logtail
- Métricas via PostHog (eventos de produto)

### Alertas críticos (Sentry)
- Webhook do Asaas falhando 3x → alerta
- Fila com >100 jobs pendentes → alerta
- Latência API >2s p95 → alerta
- Storage R2 >80% quota → alerta

---

## 10. Variáveis de ambiente

```env
# App
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
APP_URL=https://api.ventus.com.br

# Database
DATABASE_URL=postgresql://...

# Redis
REDIS_URL=redis://...

# JWT
JWT_SECRET=<min 64 chars>
JWT_EXPIRES_IN=7d

# Asaas
ASAAS_API_KEY=...
ASAAS_WEBHOOK_SECRET=...

# Z-API
ZAPI_INSTANCE_ID=...
ZAPI_TOKEN=...
ZAPI_CLIENT_TOKEN=...

# AWS
AWS_REGION=sa-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
REKOGNITION_COLLECTION_PREFIX=ventus

# Cloudflare R2
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_FOTOS=ventus-fotos
R2_BUCKET_FOTOS_EDITED=ventus-fotos-edited

# Sentry
SENTRY_DSN=...
```

---

## 11. Testes

### Cobertura mínima
- **Unit:** serviços de domínio e lib utilities (>80%)
- **Integration:** rotas críticas (auth, pagamento, foto upload, face match)
- **E2E:** fluxo Aluno → Galeria → Seleção → Editor → Entrega

### Estrutura
```
tests/
├── unit/
│   ├── services/
│   └── lib/
├── integration/
│   ├── auth.test.ts
│   ├── turmas.test.ts
│   └── webhooks.test.ts
└── e2e/
    └── fotografia-fluxo-completo.test.ts
```

---

## 12. Performance — alvos

- **API latência p95:** <300ms para reads, <800ms para writes
- **Throughput:** 100 req/s sustentado por instância
- **Worker face:** ≥10 fotos/min por worker
- **Worker WhatsApp:** ≥30 mensagens/min
- **DB query lenta:** alerta se >100ms (índice faltando)

---

## 13. Deploy

### Ambientes

| Ambiente | URL | Trigger |
|---|---|---|
| `dev` (local) | `localhost:3000` | dev local |
| `staging` | `api-staging.ventus.com.br` | merge em `main` |
| `production` | `api.ventus.com.br` | tag `v*.*.*` |

### CI/CD (GitHub Actions)
1. Lint + Type check
2. Unit tests + integration tests
3. Build Docker image
4. Push para registry
5. Deploy Railway (staging auto, production manual approval)

### Migrations
- Prisma Migrate em deploy (não em runtime)
- Sempre backwards-compatible (rolling deploy)

---

## 14. Segurança

- **HTTPS only** (HSTS no Vercel/Railway)
- **CORS** restrito ao domínio Ventus
- **Rate limiting:** 100 req/min por IP, 1000 req/min por user
- **Helmet** plugin no Fastify
- **Sanitização** de inputs antes de salvar
- **Senhas** hasheadas com Argon2 (não bcrypt)
- **JWT secrets** rotacionados a cada 90 dias
- **Auditoria** de toda ação financeira em `audit_log`
- **LGPD:** logs de acesso a dados pessoais em `lgpd_eventos`

---

## 15. Documentação OpenAPI

API gera spec OpenAPI 3.1 automática via `@fastify/swagger` em `/docs/openapi.json`.

Time de IA front-end consome esse spec para gerar tipos TS via `openapi-typescript`.

---

## 16. Erros comuns a evitar

❌ Não fazer queries N+1 (use Prisma `include`/`select`)
❌ Não retornar `tenant_id` em respostas (info interna)
❌ Não logar dados sensíveis (CPF, email, telefone) em logs
❌ Não fazer chamadas externas dentro de transação DB
❌ Não usar `findFirst` quando `findUnique` é correto (semântica)
❌ Não usar `JSON.parse` direto em request body (usar Zod)
❌ Não esquecer índices em FKs e colunas de filtro
❌ Não confiar em validação de cliente (validar sempre no servidor)
