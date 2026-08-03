# 02 — Arquitetura

## 2.1 Estilo arquitetural

**Modular Monolith** com workers separados por responsabilidade (não microservices ainda).

**Por quê:**
- Time pequeno, escopo bem delimitado, evolução rápida → microservices introduzem complexidade prematura
- Domínios bem separados em pacotes (`domain-sales`, `domain-photos` etc.) facilitam extração futura para microservices se a Ventus crescer

**Multi-tenant lógico** — uma instância serve múltiplas empresas de formatura no futuro (white-label).

**Para o MVP:** Ventus é o único tenant. Mas o esquema multi-tenant já existe desde o dia 1 (todas as tabelas têm `tenant_id`).

---

## 2.2 Diagrama de alto nível (C4 Context)

```
┌─────────────────────────────────────────────────────────────────┐
│                         USUÁRIOS                                │
├─────────────┬───────────┬──────────┬──────────┬─────────────────┤
│   Diretor   │ Formando  │Convidado │ Operador │ Fotógrafo/Editor│
│   (web)     │  (PWA)    │ (link)   │ (tablet) │     (web)       │
└──────┬──────┴─────┬─────┴────┬─────┴────┬─────┴───────┬─────────┘
       │            │          │          │             │
       └────────────┴──────────┴──────────┴─────────────┘
                              │
                              ▼
                ┌─────────────────────────────┐
                │     PLATAFORMA VENTUS       │
                │    (Next.js + Fastify)      │
                └─────────────┬───────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌──────────────┐    ┌──────────────────┐
│   Postgres    │    │  Redis +     │    │  Cloudflare R2   │
│  (Supabase)   │    │  BullMQ      │    │  (fotos/vídeos)  │
└───────────────┘    └──────┬───────┘    └──────────────────┘
                            │
                  ┌─────────┴─────────┐
                  │                   │
                  ▼                   ▼
          ┌─────────────┐    ┌────────────────┐
          │ Worker FOTO │    │ Worker COMM    │
          │ (face rec.) │    │ (WhatsApp/SMS) │
          └─────────────┘    └────────────────┘

        ┌───────────────── INTEGRAÇÕES EXTERNAS ─────────────────┐
        │                                                        │
        │  Asaas (pagamento)    Z-API (WhatsApp)                 │
        │  AWS Rekognition      Print server local (Zebra ZPL)   │
        │  (face matching)      Sentry + PostHog (obs)           │
        │                                                        │
        └────────────────────────────────────────────────────────┘
```

---

## 2.3 Decisões técnicas (ADRs resumidos)

### ADR-001: Stack front-end → React + Next.js 15

**Decisão:** Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui

**Por quê:**
- React é o stack que o time já domina (declarado pelo Elison na reunião)
- Next.js 15 dá SSR para SEO de páginas públicas + PWA out-of-box para mobile
- Tailwind + shadcn/ui é o que ferramentas como **V0 (Vercel) e Lovable** geram por padrão → integra com a metodologia AI-first do time

**Trade-offs aceitos:**
- Vendor lock-in moderado com Vercel (mitigado: Next.js roda em qualquer Node)
- Curva inicial do App Router (mas time IA-driven não sofre tanto)

---

### ADR-002: Stack backend → Fastify + Postgres

**Decisão:** Node.js + **Fastify** (não NestJS, não Express) + Postgres + Prisma

**Por quê:**
- Fastify é o framework Node mais rápido e simples — **menos código boilerplate** para o time SENAI executar
- Postgres é commodity, time SENAI domina (declarado: "fazem muito banco de dados, big data")
- Prisma gera tipos TS automáticos → time front-end IA recebe schemas tipados de graça

**Alternativas consideradas:**
- **NestJS:** mais estruturado mas mais verboso. Descartado para MVP.
- **Python/FastAPI:** Elison disse explicitamente "a gente não usa Python".
- **Supabase Edge Functions:** considerar para v2 se o backend SENAI quiser delegar funções simples.

---

### ADR-003: Banco de dados → Supabase (Postgres gerenciado)

**Decisão:** Supabase para Postgres + Auth + Storage backup

**Por quê:**
- Postgres gerenciado com backup automático (sem ops para o time SENAI)
- **Row-Level Security (RLS)** nativo → multi-tenancy seguro sem código adicional
- Auth integrado (magic link via WhatsApp/email)
- Storage como fallback do R2

**Esquema multi-tenant via RLS:**
```sql
CREATE POLICY tenant_isolation ON eventos
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

---

### ADR-004: Storage de fotos → Cloudflare R2

**Decisão:** R2 (não S3, não Supabase Storage) para arquivos grandes

**Por quê:**
- **Egress fee = 0** → crítico quando 200 alunos baixam fotos em alta resolução
- API S3-compatible → migração trivial se necessário
- ~$0.015/GB/mês de storage (similar S3 mas sem custo de saída)

**Estimativa de custo:**
- 10 turmas × 1500 fotos × 5MB = 75GB → ~$1/mês de storage
- Sem custo de download → **economia direta de centenas de dólares/mês** vs S3

---

### ADR-005: Pagamento → Asaas (MVP) → Pagar.me (escala)

**Decisão MVP:** Asaas

**Por quê:**
- **Parcelamento em até 21x sem juros** out-of-box (diferencial brutal para formatura)
- Pix nativo, link de pagamento, boleto, cartão
- API REST simples
- Sem custo fixo, só taxa por transação

**Quando migrar para Pagar.me:**
- Quando precisar de **split de pagamento** entre Ventus e comissão de turma com mais flexibilidade
- Quando volume justificar negociação de taxas

---

### ADR-006: WhatsApp → Z-API (BSP brasileiro)

**Decisão:** Z-API como BSP

**Por quê:**
- Provider brasileiro — suporte e documentação em português
- Suporta envio de mídia (link de galeria com preview de imagem)
- Webhook para eventos (entregue, lido, respondido)
- Custo previsível (por mensagem)

**Alternativa para escala:** Meta Cloud API direto (mais barato, mais complexo).

---

### ADR-007: Reconhecimento facial → AWS Rekognition

**Decisão MVP:** AWS Rekognition (managed)

**Por quê:**
- Time-to-market: zero infra para o time SENAI gerenciar
- ~$1 por 1.000 imagens analisadas
- Precisão alta para o use case de matching evento

**Quando migrar para self-hosted (InsightFace):**
- Quando o custo mensal de Rekognition passar de R$ 500-1000/mês
- Quando volume de fotos por evento ficar consistente >5000

**Compliance LGPD:** Rekognition processa em região AWS (us-east-1 ou sa-east-1). Embeddings faciais são considerados dados biométricos → consentimento explícito obrigatório no cadastro do aluno.

---

### ADR-008: Impressão de pulseira → Zebra ZD510-HC + print server local

**Decisão:** Zebra ZD510-HC (modelo padrão da indústria de eventos) com **print server Node.js local** rodando no laptop/mini-PC da portaria

**Por quê:**
- Print server local resolve oscilação de internet no evento (cache de impressão offline)
- ZPL é texto puro — fácil de gerar e debugar
- Cartucho Z-Band antimicrobiano (selo de qualidade)

**Arquitetura da impressão:**
```
[Tablet operador]──QR scan──→[API Ventus]──fila Redis──→[Print server local]──USB/Ethernet──→[Zebra ZD510]
                                                              │
                                                              └─ cache offline (até 100 jobs)
```

---

### ADR-009: Auth → Supabase Auth com magic link via WhatsApp

**Decisão:** Supabase Auth + provider customizado para enviar magic link via Z-API

**Por quê:**
- **Aluno não digita senha** — recebe link no WhatsApp e clica
- Zero atrito no primeiro acesso
- Convidado tem token único no QR (sem precisar de auth)

**Operadores (admin Ventus, fotógrafo, editor):** auth tradicional email + senha + 2FA opcional.

---

### ADR-010: Deploy

| Componente | Onde | Por quê |
|---|---|---|
| Front-end web (Next.js) | **Vercel** | Deploy automático do Git, edge network, gratuito até MVP |
| API Fastify | **Railway** ou **Fly.io** | Deploy simples, escala vertical, ~$5-20/mês |
| Workers (foto, comm) | **Railway** | Mesma infra da API |
| Print server | **Mini-PC local no evento** | Latência zero, offline-resilient |
| Postgres | **Supabase** | Gerenciado, free tier generoso |
| Redis | **Upstash** ou Railway | Pay-per-use |
| Storage fotos | **Cloudflare R2** | Sem egress fee |

**Custo estimado MVP (1 tenant Ventus, 5 turmas):** ~R$ 200-400/mês de infra.

---

## 2.4 Princípios arquiteturais

1. **Mobile-first para alunos e convidados** — todo flow externo testado primeiro em mobile real
2. **Offline-first onde a internet falha** — check-in e impressão de pulseira têm fallback local
3. **Idempotência em integrações** — Asaas, Z-API, Rekognition podem reprocessar sem efeitos colaterais
4. **Auditoria completa** — toda ação que afeta dinheiro ou dados pessoais é logada
5. **LGPD by design** — consentimento explícito, direito ao esquecimento, exportação de dados
6. **Branding Ventus first** — design system reflete azul/branco da empresa (não usar Tailwind default)

---

## 2.5 Estrutura do código (monorepo)

```
formaturas-sistema/
├── apps/
│   ├── web/                  # Next.js — portais web (admin, formando, fotógrafo, editor)
│   ├── api/                  # Fastify — REST API
│   ├── worker-photos/        # BullMQ worker — face recognition + processamento
│   ├── worker-comm/          # BullMQ worker — WhatsApp, email, SMS
│   └── print-server/         # Node CLI — fila de impressão Zebra (rodada local)
├── packages/
│   ├── domain-sales/         # Lógica: contratos, pagamentos, parcelas
│   ├── domain-events/        # Lógica: turmas, eventos, convidados, RSVP
│   ├── domain-access/        # Lógica: QR, check-in, pulseira
│   ├── domain-photos/        # Lógica: galerias, créditos, fila de edição
│   ├── shared-db/            # Prisma schema + migrations
│   ├── shared-ui/            # Design system Ventus (componentes)
│   └── shared-types/         # Tipos TS compartilhados
├── docs/                     # ESTA DOCUMENTAÇÃO
└── infra/                    # Terraform/Railway configs
```

**Gerenciador de pacotes:** **pnpm workspaces** (mais rápido, menos disco que npm/yarn).

---

## 2.6 O que NÃO está na arquitetura (anti-escopo MVP)

- Microservices
- Kubernetes
- Event sourcing / CQRS
- GraphQL (REST + tRPC interno é suficiente)
- App nativo iOS/Android
- Streaming de vídeo
- Realtime via WebSockets (polling é OK no MVP, exceto check-in)
- Internacionalização (só pt-BR)
- Multi-currency (só BRL)
