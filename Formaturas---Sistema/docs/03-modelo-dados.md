# 03 — Modelo de Dados

## 3.1 Convenções

- **PostgreSQL 15+**
- **UUID** como PK (não bigint) — multi-tenant friendly
- **`tenant_id`** em toda tabela (exceto `tenants` e tabelas de catálogo) → habilita RLS
- **Soft delete:** coluna `deleted_at TIMESTAMPTZ NULL` (não DELETE físico)
- **Timestamps:** `created_at`, `updated_at` (TIMESTAMPTZ com default `now()`)
- **Enums:** Postgres enums para valores fixos (status, tipo)
- **Snake_case** em SQL, **camelCase** no TypeScript (Prisma faz a tradução)

---

## 3.2 Schema canônico (Prisma)

> Este é o schema autoritativo. Time SENAI implementa exatamente isto.

```prisma
// schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// =============================================================================
// MULTI-TENANCY
// =============================================================================

model Tenant {
  id            String    @id @default(uuid())
  slug          String    @unique  // ventus, exemplo-empresa, etc.
  nomeEmpresa   String
  cnpj          String?
  logoUrl       String?
  corPrimaria   String    @default("#1E3A8A")  // azul Ventus
  corSecundaria String    @default("#FFFFFF")
  dominioCustom String?   @unique  // ventus.formaturas.com (CNAME)
  whatsappBspToken String? // Z-API token
  asaasApiKey   String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  usuarios      Usuario[]
  turmas        Turma[]
  eventos       Evento[]

  @@map("tenants")
}

// =============================================================================
// USUÁRIOS E AUTENTICAÇÃO
// =============================================================================

enum TipoUsuario {
  ADMIN_TENANT      // Diretor Ventus
  COMISSAO          // Membro da comissão de turma
  FORMANDO          // Aluno
  FOTOGRAFO         // Equipe de foto
  EDITOR            // Editor de fotos
  OPERADOR          // Operador de portaria
}

model Usuario {
  id            String      @id @default(uuid())
  tenantId      String
  tenant        Tenant      @relation(fields: [tenantId], references: [id])
  tipo          TipoUsuario
  nomeCompleto  String
  email         String?
  telefone      String      // Formato E.164: +5538998765432
  cpf           String?
  fotoPerfilUrl String?
  authUserId    String?     @unique  // Supabase Auth user.id
  consentimentoLgpd Boolean @default(false)
  consentimentoLgpdEm DateTime?
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  deletedAt     DateTime?

  formandoEm    Formando[]
  fotosTiradas  Foto[]      @relation("FotografoFotos")

  @@unique([tenantId, telefone])
  @@map("usuarios")
}

// =============================================================================
// TURMA E EVENTOS
// =============================================================================

model Turma {
  id              String    @id @default(uuid())
  tenantId        String
  tenant          Tenant    @relation(fields: [tenantId], references: [id])
  nome            String    // "Enfermagem FIP - 2026/2"
  faculdade       String    // FIP, Funorte, UNIFIPMOC
  curso           String    // Enfermagem, Direito, etc.
  anoSemestre     String    // "2026/2"
  capaUrl         String?
  status          StatusTurma @default(PLANEJAMENTO)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  formandos       Formando[]
  eventos         Evento[]
  pacotes         Pacote[]
  campanhas       Campanha[]

  @@map("turmas")
}

enum StatusTurma {
  PLANEJAMENTO
  CAPTACAO
  ATIVA
  ENCERRADA
}

model Formando {
  id              String    @id @default(uuid())
  tenantId        String
  turmaId         String
  turma           Turma     @relation(fields: [turmaId], references: [id])
  usuarioId       String
  usuario         Usuario   @relation(fields: [usuarioId], references: [id])
  matricula       String?
  isComissao      Boolean   @default(false)
  contratoId      String?   @unique
  contrato        Contrato? @relation(fields: [contratoId], references: [id])
  fotoReferenciaUrl String? // foto usada para face recognition
  embeddingFacial Bytes?    // vetor 512d Rekognition (base64) — cacheado
  cotaConvidados  Int       @default(2)
  creditosFotosTotal Int    @default(0)
  creditosFotosUsados Int   @default(0)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  deletedAt       DateTime?

  convidados      Convidado[]
  fotosNaGaleria  FotoFormando[]
  selecoes        SelecaoFoto[]

  @@unique([turmaId, usuarioId])
  @@map("formandos")
}

model Evento {
  id              String        @id @default(uuid())
  tenantId        String
  tenant          Tenant        @relation(fields: [tenantId], references: [id])
  turmaId         String
  turma           Turma         @relation(fields: [turmaId], references: [id])
  nome            String        // "Colação de Grau", "Baile de Formatura"
  tipo            TipoEvento
  dataHoraInicio  DateTime
  dataHoraFim     DateTime?
  localNome       String
  localEndereco   String
  localMapaUrl    String?
  capacidadeTotal Int?
  dressCode       String?
  observacoes     String?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  convidados      Convidado[]
  checkins        Checkin[]
  galerias        Galeria[]

  @@map("eventos")
}

enum TipoEvento {
  COLACAO_GRAU
  MISSA
  CERIMONIA
  BAILE
  ENSAIO_FOTO
  OUTROS
}

// =============================================================================
// VENDAS, PACOTES E PAGAMENTO
// =============================================================================

model Pacote {
  id              String    @id @default(uuid())
  tenantId        String
  turmaId         String
  turma           Turma     @relation(fields: [turmaId], references: [id])
  nome            String    // "Pacote Diamante", "Pacote Ouro"
  descricao       String?
  valorTotal      Decimal   @db.Decimal(10, 2)
  parcelasPadrao  Int       @default(12)
  creditosFotos   Int       @default(50)
  cotaConvidados  Int       @default(2)
  ordem           Int       @default(0)
  ativo           Boolean   @default(true)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  contratos       Contrato[]

  @@map("pacotes")
}

model Contrato {
  id              String        @id @default(uuid())
  tenantId        String
  pacoteId        String
  pacote          Pacote        @relation(fields: [pacoteId], references: [id])
  formando        Formando?
  numero          String        @unique
  valorTotal      Decimal       @db.Decimal(10, 2)
  parcelas        Int
  status          StatusContrato @default(RASCUNHO)
  assinadoEm      DateTime?
  assinaturaIp    String?
  termosVersao    String        // ex: "v1.0-2026-04"
  termosUrl       String?       // PDF do contrato assinado
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  cobrancas       Cobranca[]

  @@map("contratos")
}

enum StatusContrato {
  RASCUNHO
  AGUARDANDO_ASSINATURA
  ATIVO
  CANCELADO
  CONCLUIDO
}

model Cobranca {
  id              String    @id @default(uuid())
  tenantId        String
  contratoId      String
  contrato        Contrato  @relation(fields: [contratoId], references: [id])
  numeroParcela   Int
  valor           Decimal   @db.Decimal(10, 2)
  vencimento      DateTime
  status          StatusCobranca @default(ABERTA)
  metodoPagamento MetodoPagamento?
  asaasChargeId   String?   @unique  // ID da cobrança no Asaas
  asaasInvoiceUrl String?   // link da fatura
  pagoEm          DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@unique([contratoId, numeroParcela])
  @@index([tenantId, vencimento])
  @@map("cobrancas")
}

enum StatusCobranca {
  ABERTA
  PAGA
  ATRASADA
  CANCELADA
  ESTORNADA
}

enum MetodoPagamento {
  PIX
  BOLETO
  CARTAO_CREDITO
  CARTAO_DEBITO
}

// =============================================================================
// DIVULGAÇÃO E CONVIDADOS
// =============================================================================

model Convidado {
  id              String    @id @default(uuid())
  tenantId        String
  formandoId      String
  formando        Formando  @relation(fields: [formandoId], references: [id])
  eventoId        String
  evento          Evento    @relation(fields: [eventoId], references: [id])
  nomeCompleto    String
  documento       String?   // CPF ou RG (opcional, p/ pulseira)
  telefone        String?
  qrToken         String    @unique  // hash único usado no QR
  rsvpStatus      RsvpStatus @default(PENDENTE)
  rsvpRespondidoEm DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  checkin         Checkin?

  @@map("convidados")
}

enum RsvpStatus {
  PENDENTE
  CONFIRMADO
  RECUSADO
}

model Campanha {
  id              String    @id @default(uuid())
  tenantId        String
  turmaId         String
  turma           Turma     @relation(fields: [turmaId], references: [id])
  nome            String
  tipo            TipoCampanha
  triggerOffsetDias Int     // ex: -90 = D-90, +1 = D+1
  triggerEventoId String?
  canal           CanalComunicacao
  templateId      String    // referência ao template aprovado pela Meta
  variaveis       Json?     // ex: {nome, dataEvento}
  ativa           Boolean   @default(true)
  createdAt       DateTime  @default(now())

  envios          EnvioMensagem[]

  @@map("campanhas")
}

enum TipoCampanha {
  CONTAGEM_REGRESSIVA
  LEMBRETE_PAGAMENTO
  ANUNCIO_FOTO_PRONTA
  CONFIRMACAO_RSVP
  CUSTOM
}

enum CanalComunicacao {
  WHATSAPP
  EMAIL
  SMS
}

model EnvioMensagem {
  id              String    @id @default(uuid())
  tenantId        String
  campanhaId      String?
  campanha        Campanha? @relation(fields: [campanhaId], references: [id])
  destinatarioId  String    // pode ser usuario_id ou convidado_id
  canal           CanalComunicacao
  status          StatusEnvio @default(PENDENTE)
  enviadoEm       DateTime?
  entregueEm      DateTime?
  lidoEm          DateTime?
  erro            String?
  createdAt       DateTime  @default(now())

  @@index([tenantId, status])
  @@map("envios_mensagem")
}

enum StatusEnvio {
  PENDENTE
  ENVIADO
  ENTREGUE
  LIDO
  FALHA
}

// =============================================================================
// CONTROLE DE ACESSO
// =============================================================================

model Checkin {
  id              String    @id @default(uuid())
  tenantId        String
  eventoId        String
  evento          Evento    @relation(fields: [eventoId], references: [id])
  convidadoId     String    @unique
  convidado       Convidado @relation(fields: [convidadoId], references: [id])
  realizadoEm     DateTime  @default(now())
  realizadoPor    String?   // usuario_id do operador
  pulseiraImpressa Boolean  @default(false)
  pulseiraImpressaEm DateTime?
  metodoValidacao MetodoValidacao @default(QR)

  @@map("checkins")
}

enum MetodoValidacao {
  QR
  FACIAL
  CPF
  MANUAL
}

// =============================================================================
// FOTOGRAFIA
// =============================================================================

model Galeria {
  id              String    @id @default(uuid())
  tenantId        String
  eventoId        String
  evento          Evento    @relation(fields: [eventoId], references: [id])
  nome            String    // "Cerimônia", "Baile - Pista", "Mesa 12"
  descricao       String?
  ordem           Int       @default(0)
  bloqueada       Boolean   @default(false) // só após Ventus liberar
  createdAt       DateTime  @default(now())

  fotos           Foto[]

  @@map("galerias")
}

model Foto {
  id              String    @id @default(uuid())
  tenantId        String
  galeriaId       String
  galeria         Galeria   @relation(fields: [galeriaId], references: [id])
  fotografoId     String?
  fotografo       Usuario?  @relation("FotografoFotos", fields: [fotografoId], references: [id])
  storageKey      String    @unique  // chave no R2
  storageKeyThumb String    // thumbnail otimizado
  storageKeyEditada String? // versão editada (após editor finalizar)
  exifTimestamp   DateTime?
  larguraPx       Int?
  alturaPx        Int?
  tamanhoBytes    BigInt?
  faceProcessada  Boolean   @default(false)
  faceProcessadaEm DateTime?
  createdAt       DateTime  @default(now())

  formandosTagueados FotoFormando[]
  selecoes        SelecaoFoto[]

  @@index([galeriaId, faceProcessada])
  @@map("fotos")
}

model FotoFormando {
  id              String    @id @default(uuid())
  tenantId        String
  fotoId          String
  foto            Foto      @relation(fields: [fotoId], references: [id])
  formandoId      String
  formando        Formando  @relation(fields: [formandoId], references: [id])
  similarityScore Float     // 0..1 da Rekognition
  validadoManualmente Boolean @default(false)
  createdAt       DateTime  @default(now())

  @@unique([fotoId, formandoId])
  @@map("fotos_formandos")
}

model SelecaoFoto {
  id              String    @id @default(uuid())
  tenantId        String
  formandoId      String
  formando        Formando  @relation(fields: [formandoId], references: [id])
  fotoId          String
  foto            Foto      @relation(fields: [fotoId], references: [id])
  status          StatusSelecao @default(SELECIONADA)
  editorId        String?
  observacaoAluno String?
  selecionadaEm   DateTime  @default(now())
  iniciadaEdicaoEm DateTime?
  finalizadaEdicaoEm DateTime?
  entregueEm      DateTime?

  @@unique([formandoId, fotoId])
  @@index([tenantId, status])
  @@map("selecoes_foto")
}

enum StatusSelecao {
  SELECIONADA       // aluno escolheu, está na fila
  EM_EDICAO         // editor pegou
  FINALIZADA        // editor terminou, pronta para entregar
  ENTREGUE          // WhatsApp foi disparado
  REJEITADA         // editor recusou (ex: foto técnica ruim)
}
```

---

## 3.3 Índices e performance

**Índices críticos (além das PKs e FKs):**

```sql
CREATE INDEX idx_cobrancas_tenant_vencimento ON cobrancas(tenant_id, vencimento) WHERE deleted_at IS NULL;
CREATE INDEX idx_envios_status ON envios_mensagem(tenant_id, status) WHERE status IN ('PENDENTE', 'FALHA');
CREATE INDEX idx_fotos_processamento ON fotos(galeria_id, face_processada);
CREATE INDEX idx_selecoes_fila ON selecoes_foto(tenant_id, status) WHERE status IN ('SELECIONADA', 'EM_EDICAO');
CREATE INDEX idx_checkins_evento ON checkins(evento_id, realizado_em DESC);
```

---

## 3.4 Row-Level Security (multi-tenant)

```sql
-- Em todas as tabelas com tenant_id:
ALTER TABLE turmas ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_turmas ON turmas
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Set por requisição na API:
SET LOCAL app.tenant_id = '<uuid-do-tenant>';
```

---

## 3.5 Migrations e seeds

**Pasta:** `packages/shared-db/prisma/migrations/`

**Seeds iniciais:**
- 1 tenant: Ventus
- 1 admin: Elison (ou contato Ventus)
- 1 turma de teste: "Enfermagem FIP — 2026/2 (DEMO)"
- 3 pacotes: Bronze (R$ 1.500), Prata (R$ 2.500), Ouro (R$ 4.000)
- 2 eventos: Colação + Baile

---

## 3.6 LGPD — direito ao esquecimento

Quando um formando solicita exclusão:
1. **Soft delete** do `Usuario` e `Formando`
2. **Hard delete** do `embeddingFacial` (dado biométrico)
3. **Mantém** `Cobrancas` por 5 anos (obrigação fiscal) com PII anonimizada
4. Log de exclusão em tabela `lgpd_eventos` para auditoria

---

## 3.7 Tabelas auxiliares (não no Prisma core)

- `lgpd_eventos` — auditoria de consentimento, acesso a dados, exclusão
- `audit_log` — toda ação que afeta dinheiro ou contrato
- `webhook_eventos` — log dos webhooks recebidos (Asaas, Z-API) para debugging
- `feature_flags` — toggle de funcionalidades por tenant
