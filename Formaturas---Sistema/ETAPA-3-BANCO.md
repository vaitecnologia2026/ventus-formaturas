# Etapa 3 — Estrutura de Banco Otimizada

> **Pré-requisitos:** ler `ETAPA-1-RELATORIO-ANALISE.md` e `ETAPA-2-ARQUITETURA.md`.
> **Stack:** PostgreSQL 16 (Supabase) + Prisma 5 + UUID v7 em PKs + `TIMESTAMPTZ` + RLS por `tenant_id`.
> **Convenção:** snake_case em SQL, camelCase em TS (Prisma `@map` faz a tradução).
> **Naming legado:** abandona a convenção húngara (`cd_*`, `nm_*`, `sn_*`), mas **preserva** todos os códigos legados em `legacyId text` para reconciliação durante a migração.

---

## Sumário

1. Convenções e tipos compartilhados
2. Enums
3. Schema — núcleo (tenant + auth)
4. Schema — domain-crm (cadastros, pessoas, configurações)
5. Schema — domain-events (turmas, eventos, brindes, produtos)
6. Schema — domain-os (ordens de serviço)
7. Schema — domain-billing (contratos, cobranças, NFe)
8. Schema — domain-comm (mensageria, modelos, campanhas)
9. Schema — domain-photos (galerias, fotos, créditos, fila editor)
10. Schema — domain-access (convidados, RSVP, check-in, pulseira)
11. Schema — domain-reports (jobs de exportação)
12. Cross-cutting (audit, webhooks, LGPD, idempotência, feature flags)
13. Índices críticos
14. RLS policies
15. Triggers e funções
16. Mapeamento campo-a-campo legado → novo
17. Pendências

---

## 1. Convenções e tipos compartilhados

```prisma
// shared-db/prisma/schema.prisma

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions", "fullTextSearchPostgres", "views"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [pgcrypto, pg_trgm, uuid_ossp, citext]
}
```

**Padrões aplicados a todas as entidades:**
- PK: `id String @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid` (precisa de uma extensão; alternativa: `uuid_generate_v4()` se v7 indisponível).
- Multi-tenant: `tenantId String @db.Uuid` (com índice composto + RLS).
- Soft-delete: `deletedAt DateTime? @db.Timestamptz(6)` quando aplicável.
- Auditoria mínima: `createdAt`, `updatedAt`, `createdById`, `updatedById`.
- `legacyId String? @unique` em **toda entidade migrável** (formato `'recurso:codigo'`).

---

## 2. Enums

```prisma
enum TipoUsuario {
  ADMIN_TENANT
  OPERADOR_FINANCEIRO
  OPERADOR_COMERCIAL
  OPERADOR_CERIMONIAL
  OPERADOR_ADMIN
  OPERADOR_QUALIDADE
  OPERADOR_DIRETORIA
  OPERADOR_MARKETING
  OPERADOR_POSVENDAS
  VENDEDOR
  FOTOGRAFO
  EDITOR
  OPERADOR_EVENTO
  COMISSAO
  FORMANDO
  // CONVIDADO não é Usuario — é token-only
}

enum TipoVendedor { CLT PJ AUTONOMO OUTRAS }
enum TipoTurno { MATUTINO VESPERTINO NOTURNO INTEGRAL EAD HIBRIDO }
enum StatusTurma { ATIVA ARQUIVADA CANCELADA }
enum TipoCurso { GRADUACAO POS_GRADUACAO TECNICO ENSINO_MEDIO LIVRE OUTRO }

// eventos
enum CategoriaEvento {
  CERIMONIA          // colação oficial, simbólica, culto, missa
  FOTOGRAFIA         // foto convite, foto família, posicionamento
  FESTA              // baile, after, family day, festa de meio
  ENSAIO             // ensaio individual, ensaio comissão, brinde
  ASSESSORIA         // cerimonial
  OUTRO
}
enum SituacaoEventoTurma { PLANEJADO CONFIRMADO REALIZADO CANCELADO REAGENDADO }

// produtos / brindes / entregas
enum TipoProduto { PRODUTO SERVICO CERIMONIAL FOTO BRINDE }
enum TipoBrinde { ALBUM PENDRIVE LINK_NUVEM ENCARTE OUTRO }
enum TipoEntrega { ALBUM_FISICO PENDRIVE_INDIVIDUAL PENDRIVE_COLETIVO LINK_NUVEM OUTRO }

// OS
enum PrioridadeOS { BAIXA MEDIA ALTA URGENTE }
enum TipoSituacaoOS { ABERTA EM_ANDAMENTO PAUSADA AGUARDANDO_TERCEIRO FECHADA CANCELADA }

// billing
enum StatusContrato { RASCUNHO AGUARDANDO_ASSINATURA ASSINADO ATIVO INADIMPLENTE QUITADO CANCELADO }
enum StatusCobranca { PENDENTE PROCESSANDO PAGA ATRASADA ESTORNADA CANCELADA }
enum MetodoPagamento { PIX BOLETO CARTAO_CREDITO CARTAO_DEBITO DINHEIRO TRANSFERENCIA }
enum TipoAssinatura { SIMPLES_ACEITE ZAPSIGN MANUAL }
enum StatusNFe { EMITIDA AUTORIZADA REJEITADA CANCELADA EM_PROCESSAMENTO }

// comunicação
enum CanalComunicacao { WHATSAPP EMAIL SMS PUSH }
enum StatusEnvio { PENDENTE ENVIADO ENTREGUE LIDO RESPONDIDO FALHOU }
enum TipoCampanha { TIMED ON_DEMAND TRIGGERED }
enum DeltaTrigger { D_180 D_90 D_30 D_7 D_1 D_DAY D_PLUS_1 OUTRO }

// fotos
enum StatusFoto {
  NA_CAMERA           // legado 0005
  DESCARREGADA        // legado 0006
  PROCESSANDO         // novo (Rekognition + Sharp em andamento)
  EM_TRATAMENTO       // legado 0007
  TRATADAS            // legado 0008
  SEPARADAS_ENTREGA   // legado 0009
  ENTREGUE_LINK       // legado 0011
  ENTREGUE_PENDRIVE   // legado 0010
  ARQUIVADA           // novo (post-365d)
}
enum StatusSelecaoFoto { SELECIONADA EM_EDICAO FINALIZADA ENTREGUE REJEITADA }

// acesso
enum CategoriaConvidado { VIP COMUM COMISSAO IMPRENSA FUNCIONARIO MENOR }
enum StatusRsvp { PENDENTE CONFIRMADO RECUSADO }
enum MetodoCheckin { QR_CODE BUSCA_MANUAL CPF }

// LGPD
enum AcaoLgpd { CONSENTIMENTO_DADOS CONSENTIMENTO_BIOMETRIA REVOGACAO EXPORTACAO ESQUECIMENTO }

// audit
enum AcaoAudit { CREATE UPDATE DELETE SOFT_DELETE LOGIN LOGOUT EXPORT IMPORT }
```

---

## 3. Schema — núcleo (tenant + auth)

```prisma
model Tenant {
  id              String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  slug            String   @unique          // "ventus"
  nome            String
  cnpj            String?  @db.VarChar(18)
  email           String
  telefone        String?
  enderecoJson    Json?    @map("endereco_json")
  logoUrl         String?  @map("logo_url")
  corPrimaria     String?  @map("cor_primaria")    // "#1E3A8A"
  corSecundaria   String?  @map("cor_secundaria")
  fonteCustom     String?  @map("fonte_custom")
  dominioCustom   String?  @unique @map("dominio_custom")
  // Secrets ficam FORA de colunas (Etapa 2 §2.6).
  // Aqui só a referência ao secret store:
  asaasSecretRef    String?  @map("asaas_secret_ref")    // "tenant/ventus/asaas"
  zapiSecretRef     String?  @map("zapi_secret_ref")
  zapsignSecretRef  String?  @map("zapsign_secret_ref")
  resendSecretRef   String?  @map("resend_secret_ref")
  rekognitionSecretRef String? @map("rekognition_secret_ref")
  configJson      Json?    @map("config_json")          // flags por tenant
  ativo           Boolean  @default(true)
  legacyId        String?  @unique @map("legacy_id")
  createdAt       DateTime @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt       DateTime @updatedAt       @db.Timestamptz(6) @map("updated_at")

  usuarios        Usuario[]
  faculdades      Faculdade[]
  // ... (relacionado a tudo, omitido por brevidade)

  @@map("tenants")
}

model Usuario {
  id              String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId        String   @db.Uuid @map("tenant_id")
  tipo            TipoUsuario
  nome            String
  email           String?  @db.Citext
  whatsapp        String?  @db.VarChar(20)
  cpf             String?  @db.VarChar(14)
  passwordHash    String?  @map("password_hash")     // null para FORMANDO/COMISSAO (magic-link)
  totpSecret      String?  @map("totp_secret")
  totpEnabled     Boolean  @default(false) @map("totp_enabled")
  ativo           Boolean  @default(true)
  ultimoAcesso    DateTime? @db.Timestamptz(6) @map("ultimo_acesso")
  legacyId        String?  @unique @map("legacy_id")  // 'usuario:0001'
  createdAt       DateTime @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt       DateTime @updatedAt       @db.Timestamptz(6) @map("updated_at")
  deletedAt       DateTime? @db.Timestamptz(6) @map("deleted_at")

  tenant          Tenant   @relation(fields: [tenantId], references: [id])
  permissoes      UsuarioPermissao[]
  formando        Formando?
  vendedor        Vendedor?
  responsavel    Responsavel?
  sessoes         Sessao[]

  @@unique([tenantId, email])
  @@unique([tenantId, whatsapp])
  @@unique([tenantId, cpf])
  @@index([tenantId, ativo])
  @@map("usuarios")
}

model UsuarioPermissao {
  id          String  @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  usuarioId   String  @db.Uuid @map("usuario_id")
  recurso     String                                  // 'turmas', 'cobrancas', etc
  acao        String                                  // 'read', 'write', 'create', 'delete', 'assign', '*'
  scopeFilter Json?   @map("scope_filter")            // ex: { "turmaIds": [...] } para assigned
  createdAt   DateTime @default(now()) @db.Timestamptz(6) @map("created_at")

  usuario     Usuario @relation(fields: [usuarioId], references: [id], onDelete: Cascade)

  @@unique([usuarioId, recurso, acao])
  @@map("usuario_permissoes")
}

model Sessao {
  id              String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  usuarioId       String   @db.Uuid @map("usuario_id")
  jti             String   @unique                    // JWT ID
  ip              String?  @db.Inet
  userAgent       String?  @map("user_agent")
  refreshTokenHash String? @map("refresh_token_hash")
  expiresAt       DateTime @db.Timestamptz(6) @map("expires_at")
  revokedAt       DateTime? @db.Timestamptz(6) @map("revoked_at")
  createdAt       DateTime @default(now()) @db.Timestamptz(6) @map("created_at")

  usuario         Usuario  @relation(fields: [usuarioId], references: [id], onDelete: Cascade)

  @@index([usuarioId, revokedAt])
  @@map("sessoes")
}

model MagicLinkToken {
  id          String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId    String   @db.Uuid @map("tenant_id")
  usuarioId   String?  @db.Uuid @map("usuario_id")    // pode ser null em primeiro acesso
  destino     String                                   // whatsapp ou email
  canal       CanalComunicacao
  tokenHash   String   @unique @map("token_hash")
  expiresAt   DateTime @db.Timestamptz(6) @map("expires_at")
  consumedAt  DateTime? @db.Timestamptz(6) @map("consumed_at")
  createdAt   DateTime @default(now()) @db.Timestamptz(6) @map("created_at")

  @@index([tenantId, expiresAt])
  @@map("magic_link_tokens")
}
```

---

## 4. Schema — domain-crm

```prisma
model Faculdade {
  id            String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId      String   @db.Uuid @map("tenant_id")
  nome          String
  mnemonico     String   @db.VarChar(20)               // 'UNIMONTES', 'FUNORTE'
  cnpj          String?  @db.VarChar(18)
  cidade        String?
  uf            String?  @db.Char(2)
  ativo         Boolean  @default(true)
  legacyId      String?  @unique @map("legacy_id")     // 'faculdade:0001'
  createdAt     DateTime @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt     DateTime @updatedAt       @db.Timestamptz(6) @map("updated_at")
  deletedAt     DateTime? @db.Timestamptz(6) @map("deleted_at")

  tenant        Tenant   @relation(fields: [tenantId], references: [id])
  cursos        Curso[]
  turmas        Turma[]

  @@unique([tenantId, mnemonico])
  @@index([tenantId, ativo])
  @@map("faculdades")
}

model Curso {
  id            String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId      String   @db.Uuid @map("tenant_id")
  faculdadeId   String?  @db.Uuid @map("faculdade_id")  // pode ser null (curso multi-faculdade)
  nome          String
  tipo          TipoCurso
  duracaoMeses  Int?     @map("duracao_meses")
  ativo         Boolean  @default(true)
  legacyId      String?  @unique @map("legacy_id")
  createdAt     DateTime @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt     DateTime @updatedAt       @db.Timestamptz(6) @map("updated_at")
  deletedAt     DateTime? @db.Timestamptz(6) @map("deleted_at")

  tenant        Tenant     @relation(fields: [tenantId], references: [id])
  faculdade     Faculdade? @relation(fields: [faculdadeId], references: [id])
  turmas        Turma[]

  @@index([tenantId, ativo])
  @@index([tenantId, faculdadeId])
  @@map("cursos")
}

model Vendedor {
  id                            String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId                      String   @db.Uuid @map("tenant_id")
  usuarioId                     String?  @db.Uuid @unique @map("usuario_id")
  nome                          String
  tipo                          TipoVendedor
  telefone                      String?
  email                         String?  @db.Citext
  isFotografo                   Boolean  @default(false) @map("is_fotografo")
  percComissao                  Decimal  @default(0) @db.Decimal(5,2) @map("perc_comissao")
  isAssessoriaCerimonial        Boolean  @default(false) @map("is_assessoria_cerimonial")
  percAssessoriaCerimonial      Decimal  @default(0) @db.Decimal(5,2) @map("perc_assessoria_cerimonial")
  tpAssessoriaCerimonial        String?  @map("tp_assessoria_cerimonial")
  ativo                         Boolean  @default(true)
  legacyId                      String?  @unique @map("legacy_id")
  createdAt                     DateTime @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt                     DateTime @updatedAt       @db.Timestamptz(6) @map("updated_at")
  deletedAt                     DateTime? @db.Timestamptz(6) @map("deleted_at")

  tenant                        Tenant   @relation(fields: [tenantId], references: [id])
  usuario                       Usuario? @relation(fields: [usuarioId], references: [id])
  turmas                        Turma[]                                   // turma.vendedorId
  contratos                     Contrato[]                                // vendedor que fechou

  @@index([tenantId, ativo])
  @@map("vendedores")
}

model Responsavel {
  id              String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId        String   @db.Uuid @map("tenant_id")
  usuarioId       String?  @db.Uuid @unique @map("usuario_id")
  nome            String
  email           String?  @db.Citext
  whatsapp        String?
  sms             String?
  ativo           Boolean  @default(true)
  legacyId        String?  @unique @map("legacy_id")
  createdAt       DateTime @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt       DateTime @updatedAt       @db.Timestamptz(6) @map("updated_at")
  deletedAt       DateTime? @db.Timestamptz(6) @map("deleted_at")

  tenant          Tenant   @relation(fields: [tenantId], references: [id])
  usuario         Usuario? @relation(fields: [usuarioId], references: [id])
  funcoes         ResponsavelFuncao[]

  @@index([tenantId, ativo])
  @@map("responsaveis")
}

model FuncaoResponsavel {
  id        String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId  String   @db.Uuid @map("tenant_id")
  nome      String                                          // 'PAI', 'MAE', 'COORDENADOR', 'PROFESSOR', 'TUTOR'
  ativo     Boolean  @default(true)
  legacyId  String?  @unique @map("legacy_id")
  createdAt DateTime @default(now()) @db.Timestamptz(6) @map("created_at")

  responsaveis ResponsavelFuncao[]

  @@unique([tenantId, nome])
  @@map("funcoes_responsavel")
}

model ResponsavelFuncao {
  responsavelId String  @db.Uuid @map("responsavel_id")
  funcaoId      String  @db.Uuid @map("funcao_id")

  responsavel   Responsavel @relation(fields: [responsavelId], references: [id], onDelete: Cascade)
  funcao        FuncaoResponsavel @relation(fields: [funcaoId], references: [id], onDelete: Cascade)

  @@id([responsavelId, funcaoId])
  @@map("responsaveis_funcoes")
}

model ConfigParametro {
  id        String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId  String   @db.Uuid @map("tenant_id")
  chave     String                                         // 'tp_sistema', 'valida_tag_nfe', etc
  valor     String?
  payload   Json?
  descricao String?
  legacyId  String?  @unique @map("legacy_id")
  createdAt DateTime @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt DateTime @updatedAt       @db.Timestamptz(6) @map("updated_at")

  @@unique([tenantId, chave])
  @@map("config_parametros")
}
```

---

## 5. Schema — domain-events

```prisma
model Turma {
  id                 String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId           String   @db.Uuid @map("tenant_id")
  nome               String
  faculdadeId        String?  @db.Uuid @map("faculdade_id")        // pode ser null em "UNIFICADA"
  cursoId            String?  @db.Uuid @map("curso_id")            // pode ser null em multi-curso
  vendedorId         String?  @db.Uuid @map("vendedor_id")         // vendedor responsável
  comissaoUsuarioIds String[] @db.Uuid @map("comissao_usuario_ids")// formandos representantes
  turno              TipoTurno?
  dtPrevisaoFormatura DateTime? @db.Date @map("dt_previsao_formatura")
  status             StatusTurma @default(ATIVA)
  observacoes        String?  @db.Text
  legacyId           String?  @unique @map("legacy_id")            // 'turma:0042'
  createdAt          DateTime @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt          DateTime @updatedAt       @db.Timestamptz(6) @map("updated_at")
  archivedAt         DateTime? @db.Timestamptz(6) @map("archived_at")

  tenant             Tenant   @relation(fields: [tenantId], references: [id])
  faculdade          Faculdade? @relation(fields: [faculdadeId], references: [id])
  curso              Curso?     @relation(fields: [cursoId], references: [id])
  vendedor           Vendedor?  @relation(fields: [vendedorId], references: [id])
  cursosExtras       TurmaCurso[]                                  // multi-curso ('UNIFICADA')
  formandos          Formando[]
  eventosTurma       EventoTurma[]
  brindesTurma       BrindeTurma[]
  contratos          Contrato[]
  pacotes            Pacote[]
  os                 OS[]
  galerias           Galeria[]
  campanhas          Campanha[]
  rekognitionCollectionId String? @map("rekognition_collection_id")  // 'turma-${id}' criado on demand

  @@unique([tenantId, nome])
  @@index([tenantId, status, dtPrevisaoFormatura])
  @@index([tenantId, faculdadeId])
  @@map("turmas")
}

model TurmaCurso {
  turmaId  String @db.Uuid @map("turma_id")
  cursoId  String @db.Uuid @map("curso_id")
  turma    Turma @relation(fields: [turmaId], references: [id], onDelete: Cascade)
  curso    Curso @relation(fields: [cursoId], references: [id])

  @@id([turmaId, cursoId])
  @@map("turmas_cursos")
}

model Formando {
  id            String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId      String   @db.Uuid @map("tenant_id")
  turmaId       String   @db.Uuid @map("turma_id")
  usuarioId     String?  @db.Uuid @unique @map("usuario_id")
  contratoId    String?  @db.Uuid @unique @map("contrato_id")
  nome          String
  cpf           String?  @db.VarChar(14)
  rg            String?  @db.VarChar(20)
  email         String?  @db.Citext
  whatsapp      String?
  dataNascimento DateTime? @db.Date @map("data_nascimento")
  fotoReferenciaUrl String? @map("foto_referencia_url")
  rekognitionFaceId String? @map("rekognition_face_id")
  embeddingFacial   Bytes?  @map("embedding_facial")    // 512d. Hard-delete em LGPD esquecimento
  consenteFoto      Boolean @default(false) @map("consente_foto")
  consenteBiometria Boolean @default(false) @map("consente_biometria")
  observacoes       String? @db.Text
  legacyId          String? @unique @map("legacy_id")   // 'aluno:1234'
  createdAt         DateTime @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt         DateTime @updatedAt       @db.Timestamptz(6) @map("updated_at")
  deletedAt         DateTime? @db.Timestamptz(6) @map("deleted_at")

  tenant            Tenant   @relation(fields: [tenantId], references: [id])
  turma             Turma    @relation(fields: [turmaId], references: [id])
  usuario           Usuario? @relation(fields: [usuarioId], references: [id])
  contrato          Contrato? @relation(fields: [contratoId], references: [id])
  convidados        Convidado[]
  selecoes          SelecaoFoto[]
  fotosRel          FotoFormando[]
  creditos          CreditoFormando[]
  notasFiscais      NotaFiscal[]

  @@unique([tenantId, turmaId, cpf])
  @@index([tenantId, turmaId, deletedAt])
  @@map("formandos")
}

model EventoCatalogo {
  id            String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId      String   @db.Uuid @map("tenant_id")
  nome          String                                            // 'COLAÇÃO OFICIAL', 'BAILE', 'FOTO CONVITE INTERNO'...
  categoria     CategoriaEvento
  descricao     String?  @db.Text
  controlaQtde  Boolean  @default(false) @map("controla_qtde")    // sn_qtde
  controlaQtdeConvidado Boolean @default(false) @map("controla_qtde_convidado") // sn_qtde_convidado
  fotosEditadasInclusas Int? @map("fotos_editadas_inclusas")     // 0, 10, 15, 20, 25, 30, 35, 40
  ativo         Boolean  @default(true)
  legacyId      String?  @unique @map("legacy_id")                // 'evento:0103'
  createdAt     DateTime @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt     DateTime @updatedAt       @db.Timestamptz(6) @map("updated_at")

  tenant        Tenant   @relation(fields: [tenantId], references: [id])
  eventosTurma  EventoTurma[]

  @@unique([tenantId, nome])
  @@index([tenantId, categoria, ativo])
  @@map("eventos_catalogo")
}

model EventoTurma {
  id                String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId          String   @db.Uuid @map("tenant_id")
  turmaId           String   @db.Uuid @map("turma_id")
  eventoCatalogoId  String   @db.Uuid @map("evento_catalogo_id")
  responsavelTurmaUsuarioId String? @db.Uuid @map("responsavel_turma_usuario_id")  // formando da comissão
  nomeResponsavelTurma String? @map("nome_responsavel_turma")     // legado: nome livre na agenda
  dtPrevista        DateTime? @db.Timestamptz(6) @map("dt_prevista")
  dtRealizada       DateTime? @db.Timestamptz(6) @map("dt_realizada")
  local             String?
  endereco          String?
  cidade            String?
  uf                String?  @db.Char(2)
  qtdeConvidados    Int?     @map("qtde_convidados")
  situacao          SituacaoEventoTurma @default(PLANEJADO)
  observacoes       String?  @db.Text
  legacyId          String?  @unique @map("legacy_id")
  createdAt         DateTime @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt         DateTime @updatedAt       @db.Timestamptz(6) @map("updated_at")

  tenant            Tenant   @relation(fields: [tenantId], references: [id])
  turma             Turma    @relation(fields: [turmaId], references: [id])
  eventoCatalogo    EventoCatalogo @relation(fields: [eventoCatalogoId], references: [id])
  galerias          Galeria[]
  convidados        Convidado[]
  checkins          Checkin[]
  campanhas         Campanha[]

  @@index([tenantId, turmaId, dtPrevista])
  @@index([tenantId, dtPrevista, situacao])
  @@map("eventos_turma")
}

model BrindeCatalogo {
  id          String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId    String   @db.Uuid @map("tenant_id")
  nome        String
  tipo        TipoBrinde
  descricao   String?  @db.Text
  ativo       Boolean  @default(true)
  legacyId    String?  @unique @map("legacy_id")
  createdAt   DateTime @default(now()) @db.Timestamptz(6) @map("created_at")

  brindesTurma BrindeTurma[]

  @@unique([tenantId, nome])
  @@map("brindes_catalogo")
}

model BrindeTurma {
  id                String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId          String   @db.Uuid @map("tenant_id")
  turmaId           String   @db.Uuid @map("turma_id")
  brindeCatalogoId  String   @db.Uuid @map("brinde_catalogo_id")
  formandoId        String?  @db.Uuid @map("formando_id")  // brinde individual ou da turma
  qtde              Int      @default(1)
  dtPrevista        DateTime? @db.Date @map("dt_prevista")
  dtRealizada       DateTime? @db.Date @map("dt_realizada")
  observacoes       String?
  legacyId          String?  @unique @map("legacy_id")
  createdAt         DateTime @default(now()) @db.Timestamptz(6) @map("created_at")

  turma             Turma @relation(fields: [turmaId], references: [id])
  brindeCatalogo    BrindeCatalogo @relation(fields: [brindeCatalogoId], references: [id])

  @@index([tenantId, turmaId])
  @@index([tenantId, dtPrevista, dtRealizada])
  @@map("brindes_turma")
}

model Produto {
  id          String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId    String   @db.Uuid @map("tenant_id")
  nome        String
  tipo        TipoProduto
  descricao   String?  @db.Text
  ativo       Boolean  @default(true)
  legacyId    String?  @unique @map("legacy_id")
  createdAt   DateTime @default(now()) @db.Timestamptz(6) @map("created_at")

  precos      ProdutoPreco[]
  itensCerimonial CerimonialItem[]

  @@unique([tenantId, nome])
  @@map("produtos")
}

model ProdutoPreco {
  id          String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId    String   @db.Uuid @map("tenant_id")
  produtoId   String   @db.Uuid @map("produto_id")
  vlCusto     Decimal  @db.Decimal(12,2) @map("vl_custo")
  vlVenda     Decimal  @db.Decimal(12,2) @map("vl_venda")
  anoVigente  Int?     @map("ano_vigente")
  validoDe    DateTime? @db.Date @map("valido_de")
  validoAte   DateTime? @db.Date @map("valido_ate")
  legacyId    String?  @unique @map("legacy_id")
  createdAt   DateTime @default(now()) @db.Timestamptz(6) @map("created_at")

  produto     Produto @relation(fields: [produtoId], references: [id])

  @@index([tenantId, produtoId, anoVigente])
  @@map("produto_precos")
}

model Cerimonial {
  id          String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId    String   @db.Uuid @map("tenant_id")
  nome        String
  ativo       Boolean  @default(true)
  legacyId    String?  @unique @map("legacy_id")
  createdAt   DateTime @default(now()) @db.Timestamptz(6) @map("created_at")

  itens       CerimonialItem[]

  @@unique([tenantId, nome])
  @@map("cerimoniais")
}

model CerimonialItem {
  id            String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId      String   @db.Uuid @map("tenant_id")
  cerimonialId  String   @db.Uuid @map("cerimonial_id")
  produtoId     String   @db.Uuid @map("produto_id")
  qtde          Int      @default(1)
  vlCusto       Decimal  @db.Decimal(12,2) @map("vl_custo")
  vlVenda       Decimal  @db.Decimal(12,2) @map("vl_venda")
  legacyId      String?  @unique @map("legacy_id")

  cerimonial    Cerimonial @relation(fields: [cerimonialId], references: [id], onDelete: Cascade)
  produto       Produto    @relation(fields: [produtoId], references: [id])

  @@index([tenantId, cerimonialId])
  @@map("cerimoniais_itens")
}

model EntregaCatalogo {
  id          String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId    String   @db.Uuid @map("tenant_id")
  nome        String                                    // 'ÁLBUM "MEMÓRIAS"', 'LINK EM NUVEM'
  tipo        TipoEntrega
  vlCusto     Decimal  @db.Decimal(12,2) @map("vl_custo")
  vlVenda     Decimal  @db.Decimal(12,2) @map("vl_venda")
  anoVigente  Int?     @map("ano_vigente")
  link        String?
  arquivoUrl  String?  @map("arquivo_url")
  ativo       Boolean  @default(true)
  legacyId    String?  @unique @map("legacy_id")
  createdAt   DateTime @default(now()) @db.Timestamptz(6) @map("created_at")

  @@unique([tenantId, nome])
  @@map("entregas_catalogo")
}

model TipoFoto {
  id        String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId  String   @db.Uuid @map("tenant_id")
  nome      String
  ativo     Boolean  @default(true)
  legacyId  String?  @unique @map("legacy_id")

  @@unique([tenantId, nome])
  @@map("tipos_foto")
}

model StatusFotoCatalogo {                                         // espelha os 7 status do legado, para configuração
  id          String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId    String   @db.Uuid @map("tenant_id")
  nome        String                                    // 'FOTOS NA CÂMERA' etc
  enum        StatusFoto                                // mapeamento ao enum Prisma
  tipo        String                                    // 'EM ANDAMENTO' / 'CONCLUIDO'
  ordem       Int      @default(0)
  ativo       Boolean  @default(true)
  legacyId    String?  @unique @map("legacy_id")

  @@unique([tenantId, nome])
  @@map("status_foto_catalogo")
}

model Compromisso {                                                // /compromisso do legado
  id          String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId    String   @db.Uuid @map("tenant_id")
  formandoId  String   @db.Uuid @map("formando_id")
  titulo      String
  descricao   String?  @db.Text
  dtCompromisso DateTime @db.Timestamptz(6) @map("dt_compromisso")
  concluido   Boolean  @default(false)
  legacyId    String?  @unique @map("legacy_id")
  createdAt   DateTime @default(now()) @db.Timestamptz(6) @map("created_at")

  @@index([tenantId, formandoId, dtCompromisso])
  @@map("compromissos")
}
```

---

## 6. Schema — domain-os

```prisma
model OSAreaResponsavel {
  id            String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId      String   @db.Uuid @map("tenant_id")
  nome          String                                    // 'EDIÇÃO', 'MARKETING', etc
  podeAbrirOS   Boolean  @default(true) @map("pode_abrir_os")
  ativo         Boolean  @default(true)
  legacyId      String?  @unique @map("legacy_id")        // 'os_area:0004'
  createdAt     DateTime @default(now()) @db.Timestamptz(6) @map("created_at")

  tipos         OSTipo[]
  os            OS[]

  @@unique([tenantId, nome])
  @@map("os_areas_responsavel")
}

model OSTipo {
  id            String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId      String   @db.Uuid @map("tenant_id")
  areaId        String   @db.Uuid @map("area_id")
  descricao     String                                    // 'TRATAMENTO DE IMAGEM', etc
  nrPrevisaoDias Int?    @map("nr_previsao_dias")        // SLA padrão
  ativo         Boolean  @default(true)
  legacyId      String?  @unique @map("legacy_id")
  createdAt     DateTime @default(now()) @db.Timestamptz(6) @map("created_at")

  area          OSAreaResponsavel @relation(fields: [areaId], references: [id])
  os            OS[]

  @@unique([tenantId, descricao])
  @@index([tenantId, areaId])
  @@map("os_tipos")
}

model OSSituacao {
  id            String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId      String   @db.Uuid @map("tenant_id")
  descricao     String                                    // 'ABERTA', 'EM ANDAMENTO', 'FECHADA'
  tipo          TipoSituacaoOS
  ordem         Int      @default(0)
  ativo         Boolean  @default(true)
  legacyId      String?  @unique @map("legacy_id")

  os            OS[]

  @@unique([tenantId, descricao])
  @@map("os_situacoes")
}

model OS {
  id              String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId        String   @db.Uuid @map("tenant_id")
  numero          Int                                          // sequencial por tenant
  turmaId         String?  @db.Uuid @map("turma_id")
  formandoId      String?  @db.Uuid @map("formando_id")
  areaId          String   @db.Uuid @map("area_id")
  tipoId          String   @db.Uuid @map("tipo_id")
  situacaoId      String   @db.Uuid @map("situacao_id")
  prioridade      PrioridadeOS @default(MEDIA)
  solicitanteUsuarioId String? @db.Uuid @map("solicitante_usuario_id")
  responsavelUsuarioId String? @db.Uuid @map("responsavel_usuario_id")
  titulo          String
  descricao       String?  @db.Text
  dtAbertura      DateTime @default(now()) @db.Timestamptz(6) @map("dt_abertura")
  dtPrevista      DateTime? @db.Timestamptz(6) @map("dt_prevista")
  dtFechamento    DateTime? @db.Timestamptz(6) @map("dt_fechamento")
  legacyId        String?  @unique @map("legacy_id")           // 'os:0042'
  createdAt       DateTime @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt       DateTime @updatedAt       @db.Timestamptz(6) @map("updated_at")

  turma           Turma?     @relation(fields: [turmaId], references: [id])
  area            OSAreaResponsavel @relation(fields: [areaId], references: [id])
  tipo            OSTipo     @relation(fields: [tipoId], references: [id])
  situacao        OSSituacao @relation(fields: [situacaoId], references: [id])
  comentarios     OSComentario[]
  anexos          OSAnexo[]

  @@unique([tenantId, numero])
  @@index([tenantId, situacaoId, dtPrevista])
  @@index([tenantId, areaId, situacaoId])
  @@index([tenantId, turmaId])
  @@index([tenantId, responsavelUsuarioId])
  @@map("os")
}

model OSComentario {
  id          String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  osId        String   @db.Uuid @map("os_id")
  usuarioId   String   @db.Uuid @map("usuario_id")
  texto       String   @db.Text
  createdAt   DateTime @default(now()) @db.Timestamptz(6) @map("created_at")

  os          OS @relation(fields: [osId], references: [id], onDelete: Cascade)

  @@index([osId])
  @@map("os_comentarios")
}

model OSAnexo {
  id          String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  osId        String   @db.Uuid @map("os_id")
  url         String
  nomeArquivo String   @map("nome_arquivo")
  mimeType    String?  @map("mime_type")
  tamanhoBytes Int?    @map("tamanho_bytes")
  createdAt   DateTime @default(now()) @db.Timestamptz(6) @map("created_at")

  os          OS @relation(fields: [osId], references: [id], onDelete: Cascade)

  @@map("os_anexos")
}
```

---

## 7. Schema — domain-billing

```prisma
model Pacote {
  id            String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId      String   @db.Uuid @map("tenant_id")
  turmaId       String   @db.Uuid @map("turma_id")
  nome          String                                          // 'Bronze', 'Prata', 'Ouro', 'Diamante'
  descricao     String?  @db.Text
  vlTotal       Decimal  @db.Decimal(12,2) @map("vl_total")
  parcelasMax   Int      @default(21) @map("parcelas_max")
  cotaConvidados Int     @default(0) @map("cota_convidados")
  fotosEditadasInclusas Int @default(0) @map("fotos_editadas_inclusas")
  creditosFotos Int      @default(0) @map("creditos_fotos")
  eventosCatalogoIds String[] @db.Uuid @map("eventos_catalogo_ids")
  brindesCatalogoIds String[] @db.Uuid @map("brindes_catalogo_ids")
  ativo         Boolean  @default(true)
  legacyId      String?  @unique @map("legacy_id")
  createdAt     DateTime @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt     DateTime @updatedAt       @db.Timestamptz(6) @map("updated_at")

  turma         Turma    @relation(fields: [turmaId], references: [id])
  contratos     Contrato[]

  @@index([tenantId, turmaId, ativo])
  @@map("pacotes")
}

model Contrato {
  id              String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId        String   @db.Uuid @map("tenant_id")
  turmaId         String   @db.Uuid @map("turma_id")
  formandoId      String   @db.Uuid @unique @map("formando_id")
  pacoteId        String   @db.Uuid @map("pacote_id")
  vendedorId      String?  @db.Uuid @map("vendedor_id")
  numero          Int                                            // sequencial por tenant
  vlTotal         Decimal  @db.Decimal(12,2) @map("vl_total")
  vlEntrada       Decimal  @default(0) @db.Decimal(12,2) @map("vl_entrada")
  parcelas        Int                                            // 1-21
  diaVencimento   Int      @map("dia_vencimento")               // 1-28
  status          StatusContrato @default(RASCUNHO)
  tipoAssinatura  TipoAssinatura @default(SIMPLES_ACEITE) @map("tipo_assinatura")
  zapsignDocumentId String? @map("zapsign_document_id")
  zapsignSignedUrl String? @map("zapsign_signed_url")
  aceiteIp         String? @db.Inet @map("aceite_ip")
  aceiteUserAgent  String? @map("aceite_user_agent")
  aceiteAt         DateTime? @db.Timestamptz(6) @map("aceite_at")
  pdfUrl          String?  @map("pdf_url")
  observacoes     String?  @db.Text
  legacyId        String?  @unique @map("legacy_id")
  createdAt       DateTime @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt       DateTime @updatedAt       @db.Timestamptz(6) @map("updated_at")
  deletedAt       DateTime? @db.Timestamptz(6) @map("deleted_at")

  turma           Turma    @relation(fields: [turmaId], references: [id])
  formando        Formando? @relation
  pacote          Pacote   @relation(fields: [pacoteId], references: [id])
  vendedor        Vendedor? @relation(fields: [vendedorId], references: [id])
  cobrancas       Cobranca[]

  @@unique([tenantId, numero])
  @@index([tenantId, turmaId, status])
  @@index([tenantId, status])
  @@map("contratos")
}

model Cobranca {
  id              String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId        String   @db.Uuid @map("tenant_id")
  contratoId      String   @db.Uuid @map("contrato_id")
  numeroParcela   Int      @map("numero_parcela")
  vlOriginal      Decimal  @db.Decimal(12,2) @map("vl_original")
  vlPago          Decimal? @db.Decimal(12,2) @map("vl_pago")
  vlMulta         Decimal  @default(0) @db.Decimal(12,2) @map("vl_multa")
  vlJuros         Decimal  @default(0) @db.Decimal(12,2) @map("vl_juros")
  vlDesconto      Decimal  @default(0) @db.Decimal(12,2) @map("vl_desconto")
  dtVencimento    DateTime @db.Date @map("dt_vencimento")
  dtPagamento     DateTime? @db.Date @map("dt_pagamento")
  status          StatusCobranca @default(PENDENTE)
  metodoPagamento MetodoPagamento? @map("metodo_pagamento")
  asaasChargeId   String?  @unique @map("asaas_charge_id")
  asaasInvoiceUrl String?  @map("asaas_invoice_url")
  asaasPaymentLink String? @map("asaas_payment_link")
  pixCopiaCola    String?  @map("pix_copia_cola")
  pixQrCode       String?  @map("pix_qr_code")
  boletoUrl       String?  @map("boleto_url")
  boletoLinhaDigitavel String? @map("boleto_linha_digitavel")
  observacoes     String?  @db.Text
  legacyId        String?  @unique @map("legacy_id")
  createdAt       DateTime @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt       DateTime @updatedAt       @db.Timestamptz(6) @map("updated_at")
  deletedAt       DateTime? @db.Timestamptz(6) @map("deleted_at")            // resolução §3 inconsistência #2

  contrato        Contrato @relation(fields: [contratoId], references: [id])

  @@unique([tenantId, contratoId, numeroParcela])
  @@index([tenantId, status, dtVencimento])
  @@map("cobrancas")
}

model NotaFiscal {
  id              String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId        String   @db.Uuid @map("tenant_id")
  formandoId      String   @db.Uuid @map("formando_id")
  contratoId      String?  @db.Uuid @map("contrato_id")
  cobrancaId      String?  @db.Uuid @map("cobranca_id")
  numero          String                                          // 'NFe' do legado
  serie           String?
  cpfDestinatario String?  @db.VarChar(14) @map("cpf_destinatario")
  emailDestinatario String? @db.Citext @map("email_destinatario")
  vlTotal         Decimal  @db.Decimal(12,2) @map("vl_total")
  status          StatusNFe
  dtEmissao       DateTime @db.Timestamptz(6) @map("dt_emissao")
  chaveAcesso     String?  @map("chave_acesso")
  xmlUrl          String?  @map("xml_url")
  pdfUrl          String?  @map("pdf_url")
  providerRef     String?  @map("provider_ref")
  legacyId        String?  @unique @map("legacy_id")
  createdAt       DateTime @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt       DateTime @updatedAt       @db.Timestamptz(6) @map("updated_at")

  formando        Formando @relation(fields: [formandoId], references: [id])

  @@unique([tenantId, numero, serie])
  @@index([tenantId, dtEmissao])
  @@map("notas_fiscais")
}
```

---

## 8. Schema — domain-comm

```prisma
model DocModelo {
  id          String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId    String   @db.Uuid @map("tenant_id")
  nome        String                                          // 'Contrato Padrão 2026', 'Recibo Pix'
  descricao   String?  @db.Text
  ativo       Boolean  @default(true)
  legacyId    String?  @unique @map("legacy_id")
  createdAt   DateTime @default(now()) @db.Timestamptz(6) @map("created_at")

  versoes     DocModeloVersao[]

  @@unique([tenantId, nome])
  @@map("doc_modelos")
}

model DocModeloVersao {
  id            String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId      String   @db.Uuid @map("tenant_id")
  modeloId      String   @db.Uuid @map("modelo_id")
  versao        Int                                            // 1, 2, 3...
  conteudoHtml  String   @db.Text @map("conteudo_html")        // template Handlebars/Mustache
  variaveis     Json?                                          // [{ nome, descricao, exemplo }]
  ativa         Boolean  @default(false)                      // só uma versão ativa por modelo
  legacyId      String?  @unique @map("legacy_id")
  createdAt     DateTime @default(now()) @db.Timestamptz(6) @map("created_at")

  modelo        DocModelo @relation(fields: [modeloId], references: [id], onDelete: Cascade)

  @@unique([modeloId, versao])
  @@index([tenantId, modeloId, ativa])
  @@map("doc_modelo_versoes")
}

model TemplateMensagem {
  id            String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId      String   @db.Uuid @map("tenant_id")
  chave         String                                         // 'cobranca_lembrete', 'galeria_pronta', 'fotos_finalizadas'
  nome          String
  canal         CanalComunicacao
  metaApprovedTemplate String? @map("meta_approved_template")  // nome do template aprovado pela Meta
  conteudo      String   @db.Text
  variaveis     Json?
  ativo         Boolean  @default(true)
  createdAt     DateTime @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt     DateTime @updatedAt       @db.Timestamptz(6) @map("updated_at")

  @@unique([tenantId, chave, canal])
  @@map("templates_mensagem")
}

model Campanha {
  id              String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId        String   @db.Uuid @map("tenant_id")
  turmaId         String?  @db.Uuid @map("turma_id")
  eventoTurmaId   String?  @db.Uuid @map("evento_turma_id")
  nome            String
  tipo            TipoCampanha
  trigger         DeltaTrigger?                                // D-90, D-30 etc
  templateChave   String   @map("template_chave")
  canal           CanalComunicacao
  publicoFiltro   Json?    @map("publico_filtro")             // ex: { status: 'INADIMPLENTE' }
  agendarPara     DateTime? @db.Timestamptz(6) @map("agendar_para")
  enviadaEm       DateTime? @db.Timestamptz(6) @map("enviada_em")
  aprovadaPorUsuarioId String? @db.Uuid @map("aprovada_por_usuario_id")
  ativa           Boolean  @default(true)
  legacyId        String?  @unique @map("legacy_id")
  createdAt       DateTime @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt       DateTime @updatedAt       @db.Timestamptz(6) @map("updated_at")

  turma           Turma?       @relation(fields: [turmaId], references: [id])
  eventoTurma     EventoTurma? @relation(fields: [eventoTurmaId], references: [id])
  envios          CampanhaEnvio[]

  @@index([tenantId, turmaId, ativa])
  @@index([tenantId, agendarPara])
  @@map("campanhas")
}

model CampanhaEnvio {
  id              String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId        String   @db.Uuid @map("tenant_id")
  campanhaId      String   @db.Uuid @map("campanha_id")
  destinatarioUsuarioId String? @db.Uuid @map("destinatario_usuario_id")
  destinatarioContato String  @map("destinatario_contato")     // whatsapp/email
  canal           CanalComunicacao
  status          StatusEnvio @default(PENDENTE)
  providerMessageId String? @map("provider_message_id")
  payload         Json?
  enviadoEm       DateTime? @db.Timestamptz(6) @map("enviado_em")
  entregueEm      DateTime? @db.Timestamptz(6) @map("entregue_em")
  lidoEm          DateTime? @db.Timestamptz(6) @map("lido_em")
  respondidoEm    DateTime? @db.Timestamptz(6) @map("respondido_em")
  errorMessage    String?  @map("error_message")
  retryCount      Int      @default(0) @map("retry_count")
  createdAt       DateTime @default(now()) @db.Timestamptz(6) @map("created_at")

  campanha        Campanha @relation(fields: [campanhaId], references: [id])

  @@index([tenantId, campanhaId, status])
  @@index([tenantId, providerMessageId])
  @@map("campanha_envios")
}
```

---

## 9. Schema — domain-photos

```prisma
model Galeria {
  id              String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId        String   @db.Uuid @map("tenant_id")
  turmaId         String   @db.Uuid @map("turma_id")
  eventoTurmaId   String?  @db.Uuid @map("evento_turma_id")
  nome            String
  descricao       String?  @db.Text
  status          StatusFoto @default(NA_CAMERA)
  qtdeFotos       Int      @default(0) @map("qtde_fotos")
  publicada       Boolean  @default(false)
  publicadaEm     DateTime? @db.Timestamptz(6) @map("publicada_em")
  legacyId        String?  @unique @map("legacy_id")
  createdAt       DateTime @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt       DateTime @updatedAt       @db.Timestamptz(6) @map("updated_at")

  turma           Turma   @relation(fields: [turmaId], references: [id])
  eventoTurma     EventoTurma? @relation(fields: [eventoTurmaId], references: [id])
  fotos           Foto[]

  @@index([tenantId, turmaId, status])
  @@map("galerias")
}

model Foto {
  id              String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId        String   @db.Uuid @map("tenant_id")
  galeriaId       String   @db.Uuid @map("galeria_id")
  filenameOriginal String  @map("filename_original")
  storageKey      String   @map("storage_key")                  // R2 key
  thumbKey        String?  @map("thumb_key")                    // 300px webp
  previewKey      String?  @map("preview_key")                  // 1200px q80
  finalKey        String?  @map("final_key")                    // versão editada
  mimeType        String   @map("mime_type")
  tamanhoBytes    BigInt   @map("tamanho_bytes")
  larguraPx       Int?     @map("largura_px")
  alturaPx        Int?     @map("altura_px")
  hashSha256      String?  @map("hash_sha256")                  // dedup
  exifJson        Json?    @map("exif_json")
  capturadaEm     DateTime? @db.Timestamptz(6) @map("capturada_em")
  status          StatusFoto @default(DESCARREGADA)
  rekognitionFacesJson Json? @map("rekognition_faces_json")    // resposta de DetectFaces
  semFace         Boolean  @default(false) @map("sem_face")    // foto vai pra galeria "Geral"
  legacyId        String?  @unique @map("legacy_id")
  createdAt       DateTime @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt       DateTime @updatedAt       @db.Timestamptz(6) @map("updated_at")
  deletedAt       DateTime? @db.Timestamptz(6) @map("deleted_at")  // resolução §3 inconsistência #1

  galeria         Galeria @relation(fields: [galeriaId], references: [id])
  formandos       FotoFormando[]
  selecoes        SelecaoFoto[]

  @@unique([tenantId, hashSha256])
  @@index([tenantId, galeriaId, status, deletedAt])
  @@index([tenantId, capturadaEm])
  @@map("fotos")
}

model FotoFormando {
  id            String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId      String   @db.Uuid @map("tenant_id")
  fotoId        String   @db.Uuid @map("foto_id")
  formandoId    String   @db.Uuid @map("formando_id")
  similarityScore Decimal? @db.Decimal(5,2) @map("similarity_score")
  matchedByRekognition Boolean @default(true) @map("matched_by_rekognition")
  manuallyTagged Boolean  @default(false) @map("manually_tagged")
  createdAt     DateTime @default(now()) @db.Timestamptz(6) @map("created_at")

  foto          Foto    @relation(fields: [fotoId], references: [id], onDelete: Cascade)
  formando      Formando @relation(fields: [formandoId], references: [id])

  @@unique([fotoId, formandoId])
  @@index([tenantId, formandoId])
  @@map("fotos_formandos")
}

model CreditoFormando {
  id            String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId      String   @db.Uuid @map("tenant_id")
  formandoId    String   @db.Uuid @map("formando_id")
  origem        String                                          // 'pacote', 'extra', 'cortesia'
  qtdeTotal     Int      @map("qtde_total")
  qtdeUsado     Int      @default(0) @map("qtde_usado")
  validadeAte   DateTime? @db.Date @map("validade_ate")
  observacoes   String?
  createdAt     DateTime @default(now()) @db.Timestamptz(6) @map("created_at")

  formando      Formando @relation(fields: [formandoId], references: [id])

  @@index([tenantId, formandoId, validadeAte])
  @@map("creditos_formando")
}

model SelecaoFoto {
  id            String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId      String   @db.Uuid @map("tenant_id")
  formandoId    String   @db.Uuid @map("formando_id")
  fotoId        String   @db.Uuid @map("foto_id")
  status        StatusSelecaoFoto @default(SELECIONADA)
  editorUsuarioId String? @db.Uuid @map("editor_usuario_id")
  pegouEm       DateTime? @db.Timestamptz(6) @map("pegou_em")
  finalizadaEm  DateTime? @db.Timestamptz(6) @map("finalizada_em")
  entregueEm    DateTime? @db.Timestamptz(6) @map("entregue_em")
  finalKey      String?  @map("final_key")                      // R2 key da versão editada
  retoqueCount  Int      @default(0) @map("retoque_count")
  observacoesEditor String? @db.Text @map("observacoes_editor")
  createdAt     DateTime @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt     DateTime @updatedAt       @db.Timestamptz(6) @map("updated_at")

  formando      Formando @relation(fields: [formandoId], references: [id])
  foto          Foto     @relation(fields: [fotoId], references: [id])

  @@unique([formandoId, fotoId])
  @@index([tenantId, status, pegouEm])
  @@index([tenantId, editorUsuarioId, status])
  @@map("selecoes_foto")
}
```

---

## 10. Schema — domain-access

```prisma
model Convidado {
  id              String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId        String   @db.Uuid @map("tenant_id")
  formandoId      String   @db.Uuid @map("formando_id")
  eventoTurmaId   String   @db.Uuid @map("evento_turma_id")
  nome            String
  cpf             String?  @db.VarChar(14)
  whatsapp        String?
  email           String?  @db.Citext
  categoria       CategoriaConvidado @default(COMUM)
  qrToken         String   @unique @map("qr_token")             // UUID v4
  qrSignature     String   @map("qr_signature")                 // HMAC-SHA256 — resolve §3 #7
  reentradaPermitida Boolean @default(false) @map("reentrada_permitida")
  observacoes     String?
  legacyId        String?  @unique @map("legacy_id")
  createdAt       DateTime @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt       DateTime @updatedAt       @db.Timestamptz(6) @map("updated_at")
  deletedAt       DateTime? @db.Timestamptz(6) @map("deleted_at")

  formando        Formando @relation(fields: [formandoId], references: [id])
  eventoTurma     EventoTurma @relation(fields: [eventoTurmaId], references: [id])
  rsvp            Rsvp?
  checkins        Checkin[]
  pulseiras       PulseiraImpressa[]

  @@index([tenantId, eventoTurmaId, categoria])
  @@index([tenantId, formandoId])
  @@map("convidados")
}

model Rsvp {
  id            String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId      String   @db.Uuid @map("tenant_id")
  convidadoId   String   @db.Uuid @unique @map("convidado_id")
  status        StatusRsvp @default(PENDENTE)
  respondidoEm  DateTime? @db.Timestamptz(6) @map("respondido_em")
  observacoes   String?
  createdAt     DateTime @default(now()) @db.Timestamptz(6) @map("created_at")
  updatedAt     DateTime @updatedAt       @db.Timestamptz(6) @map("updated_at")

  convidado     Convidado @relation(fields: [convidadoId], references: [id], onDelete: Cascade)

  @@index([tenantId, status])
  @@map("rsvps")
}

model Checkin {
  id              String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId        String   @db.Uuid @map("tenant_id")
  eventoTurmaId   String   @db.Uuid @map("evento_turma_id")
  convidadoId     String   @db.Uuid @map("convidado_id")
  metodo          MetodoCheckin
  operadorUsuarioId String @db.Uuid @map("operador_usuario_id")
  pontoAcesso     String?  @map("ponto_acesso")
  ip              String?  @db.Inet
  observacoes     String?
  realizadoEm     DateTime @default(now()) @db.Timestamptz(6) @map("realizado_em")
  createdAt       DateTime @default(now()) @db.Timestamptz(6) @map("created_at")

  convidado       Convidado @relation(fields: [convidadoId], references: [id])
  eventoTurma     EventoTurma @relation(fields: [eventoTurmaId], references: [id])

  @@index([tenantId, eventoTurmaId, realizadoEm])
  @@index([tenantId, convidadoId])
  @@map("checkins")
}

model PulseiraImpressa {
  id            String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId      String   @db.Uuid @map("tenant_id")
  convidadoId   String   @db.Uuid @map("convidado_id")
  checkinId     String?  @db.Uuid @map("checkin_id")
  printerId     String?  @map("printer_id")
  zplPayload    String?  @db.Text @map("zpl_payload")
  status        String                                          // 'queued', 'sent', 'printed', 'failed'
  reimpressao   Boolean  @default(false)
  printedAt     DateTime? @db.Timestamptz(6) @map("printed_at")
  createdAt     DateTime @default(now()) @db.Timestamptz(6) @map("created_at")

  convidado     Convidado @relation(fields: [convidadoId], references: [id])

  @@index([tenantId, convidadoId])
  @@index([tenantId, status])
  @@map("pulseiras_impressas")
}
```

---

## 11. Schema — domain-reports

```prisma
model RelatorioJob {
  id              String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId        String   @db.Uuid @map("tenant_id")
  solicitanteUsuarioId String @db.Uuid @map("solicitante_usuario_id")
  tipo            String                                          // 'aluno_xls', 'aluno_brinde', 'beca_pdf', 'encarte_xls', 'financeiro_xls', etc
  parametros      Json?                                          // filtros (turma, período...)
  status          String   @default("PENDING")                   // PENDING, RUNNING, DONE, FAILED
  arquivoUrl      String?  @map("arquivo_url")
  errorMessage    String?  @map("error_message")
  startedAt       DateTime? @db.Timestamptz(6) @map("started_at")
  finishedAt      DateTime? @db.Timestamptz(6) @map("finished_at")
  expiresAt       DateTime? @db.Timestamptz(6) @map("expires_at") // R2 lifecycle 30d
  createdAt       DateTime @default(now()) @db.Timestamptz(6) @map("created_at")

  @@index([tenantId, solicitanteUsuarioId, status])
  @@map("relatorio_jobs")
}
```

---

## 12. Cross-cutting (audit, webhooks, LGPD, idempotência, feature flags)

```prisma
model AuditLog {
  id          BigInt   @id @default(autoincrement())
  tenantId    String?  @db.Uuid @map("tenant_id")
  usuarioId   String?  @db.Uuid @map("usuario_id")
  acao        AcaoAudit
  entityType  String   @map("entity_type")                     // 'Contrato', 'Cobranca', etc
  entityId    String   @db.Uuid @map("entity_id")
  oldData     Json?    @map("old_data")
  newData     Json?    @map("new_data")
  diff        Json?
  ip          String?  @db.Inet
  userAgent   String?  @map("user_agent")
  context     Json?                                              // requestId, sessionId
  createdAt   DateTime @default(now()) @db.Timestamptz(6) @map("created_at")

  @@index([tenantId, entityType, entityId, createdAt])
  @@index([tenantId, usuarioId, createdAt])
  @@index([createdAt])
  @@map("audit_log")
}

model WebhookEvento {
  id              BigInt   @id @default(autoincrement())
  tenantId        String?  @db.Uuid @map("tenant_id")
  provider        String                                          // 'asaas', 'zapi', 'zapsign', 'rekognition'
  eventType       String   @map("event_type")
  externalId      String?  @map("external_id")                   // id do evento no provider
  payload         Json
  signature       String?
  signatureValid  Boolean? @map("signature_valid")
  receivedAt      DateTime @default(now()) @db.Timestamptz(6) @map("received_at")
  processedAt     DateTime? @db.Timestamptz(6) @map("processed_at")
  processingError String?  @map("processing_error")
  retryCount      Int      @default(0) @map("retry_count")

  @@unique([provider, externalId])
  @@index([tenantId, provider, receivedAt])
  @@index([provider, processedAt])
  @@map("webhook_eventos")
}

model LgpdEvento {
  id              BigInt   @id @default(autoincrement())
  tenantId        String   @db.Uuid @map("tenant_id")
  usuarioId       String?  @db.Uuid @map("usuario_id")
  formandoId      String?  @db.Uuid @map("formando_id")
  acao            AcaoLgpd
  payload         Json?                                          // detalhes (consentido o quê, exportado o quê)
  ip              String?  @db.Inet
  userAgent       String?  @map("user_agent")
  createdAt       DateTime @default(now()) @db.Timestamptz(6) @map("created_at")

  @@index([tenantId, formandoId, acao])
  @@index([createdAt])
  @@map("lgpd_eventos")
}

model FeatureFlag {
  id          String   @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  tenantId    String?  @db.Uuid @map("tenant_id")               // null = global
  chave       String                                              // 'rekognition.v2', 'campaigns.beta'
  habilitada  Boolean  @default(false)
  payload     Json?                                              // % rollout, segmentos, etc
  descricao   String?
  updatedAt   DateTime @updatedAt @db.Timestamptz(6) @map("updated_at")

  @@unique([tenantId, chave])
  @@map("feature_flags")
}

model IdempotencyKey {
  key             String   @id
  tenantId        String   @db.Uuid @map("tenant_id")
  endpoint        String
  requestHash     String   @map("request_hash")
  responseStatus  Int?     @map("response_status")
  responseBody    Json?    @map("response_body")
  createdAt       DateTime @default(now()) @db.Timestamptz(6) @map("created_at")
  expiresAt       DateTime @db.Timestamptz(6) @map("expires_at")

  @@index([tenantId, endpoint])
  @@index([expiresAt])
  @@map("idempotency_keys")
}
```

---

## 13. Índices críticos (resumo + raciocínio)

```sql
-- Listas longas (legado tinha sorttable.js no client)
CREATE INDEX idx_formandos_turma_ativo
  ON formandos (tenant_id, turma_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_brindes_turma_pendente
  ON brindes_turma (tenant_id, dt_prevista, dt_realizada);

CREATE INDEX idx_os_dashboard
  ON os (tenant_id, situacao_id, prioridade, dt_prevista);

-- Cobranças (cron de lembrete diário)
CREATE INDEX idx_cobrancas_lembrete
  ON cobrancas (tenant_id, status, dt_vencimento)
  WHERE deleted_at IS NULL AND status IN ('PENDENTE','ATRASADA');

-- Fotos (galeria com filtro por face)
CREATE INDEX idx_fotos_formando_status
  ON fotos_formandos (tenant_id, formando_id);

CREATE INDEX idx_fotos_status_processamento
  ON fotos (tenant_id, galeria_id, status)
  WHERE deleted_at IS NULL;

-- Fila do editor
CREATE INDEX idx_selecoes_fila
  ON selecoes_foto (tenant_id, status, pegou_em)
  WHERE status IN ('SELECIONADA', 'EM_EDICAO');

-- Check-in ao vivo
CREATE INDEX idx_checkins_ao_vivo
  ON checkins (tenant_id, evento_turma_id, realizado_em DESC);

-- Busca textual (substitui sorttable)
CREATE INDEX idx_formandos_nome_trgm
  ON formandos USING gin (nome gin_trgm_ops);

CREATE INDEX idx_turmas_nome_trgm
  ON turmas USING gin (nome gin_trgm_ops);

-- Webhooks
CREATE INDEX idx_webhook_pendente
  ON webhook_eventos (provider, processed_at)
  WHERE processed_at IS NULL;

-- Audit (pesquisa por entidade)
CREATE INDEX idx_audit_entity
  ON audit_log (tenant_id, entity_type, entity_id, created_at DESC);

-- Idempotência (limpeza)
CREATE INDEX idx_idempotency_expires
  ON idempotency_keys (expires_at);
```

---

## 14. RLS policies (exemplos)

```sql
-- Habilitar RLS em todas as tabelas com tenant_id
ALTER TABLE turmas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE formandos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE contratos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE cobrancas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE os             ENABLE ROW LEVEL SECURITY;
ALTER TABLE galerias       ENABLE ROW LEVEL SECURITY;
ALTER TABLE fotos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE convidados     ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkins       ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log      ENABLE ROW LEVEL SECURITY;
-- ... (repetir pra todas)

-- Política padrão por tenant
CREATE POLICY tenant_isolation_turmas ON turmas
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_formandos ON formandos
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Aplicar na conexão a cada request:
-- SET LOCAL app.tenant_id = '...';

-- Catálogos globais NÃO têm RLS (eventos_catalogo, etc — quando forem realmente globais)
```

> **Observação:** com RLS habilitado, queries Prisma diretas podem retornar zero rows se `app.tenant_id` não foi setado. Middleware Fastify garante set + reset por transação.

---

## 15. Triggers e funções

### 15.1 Trigger genérico de auditoria

```sql
CREATE OR REPLACE FUNCTION audit_trigger() RETURNS TRIGGER AS $$
DECLARE
  v_tenant uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
  v_user   uuid := nullif(current_setting('app.user_id', true), '')::uuid;
  v_ip     inet := nullif(current_setting('app.ip', true), '')::inet;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    INSERT INTO audit_log (tenant_id, usuario_id, acao, entity_type, entity_id, old_data, ip)
      VALUES (v_tenant, v_user, 'DELETE', TG_TABLE_NAME, OLD.id, to_jsonb(OLD), v_ip);
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO audit_log (tenant_id, usuario_id, acao, entity_type, entity_id, old_data, new_data, ip)
      VALUES (v_tenant, v_user, 'UPDATE', TG_TABLE_NAME, NEW.id, to_jsonb(OLD), to_jsonb(NEW), v_ip);
    RETURN NEW;
  ELSIF (TG_OP = 'INSERT') THEN
    INSERT INTO audit_log (tenant_id, usuario_id, acao, entity_type, entity_id, new_data, ip)
      VALUES (v_tenant, v_user, 'CREATE', TG_TABLE_NAME, NEW.id, to_jsonb(NEW), v_ip);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Aplicar nos modelos sensíveis:
CREATE TRIGGER audit_contratos
  AFTER INSERT OR UPDATE OR DELETE ON contratos
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER audit_cobrancas AFTER INSERT OR UPDATE OR DELETE ON cobrancas FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_os AFTER INSERT OR UPDATE OR DELETE ON os FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_formandos AFTER INSERT OR UPDATE OR DELETE ON formandos FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_usuarios AFTER INSERT OR UPDATE OR DELETE ON usuarios FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_vendedores AFTER INSERT OR UPDATE OR DELETE ON vendedores FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_pacotes AFTER INSERT OR UPDATE OR DELETE ON pacotes FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_tenants AFTER INSERT OR UPDATE OR DELETE ON tenants FOR EACH ROW EXECUTE FUNCTION audit_trigger();
```

### 15.2 Função de notificação para painel ao vivo

```sql
CREATE OR REPLACE FUNCTION notify_checkin() RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify(
    'checkin:' || NEW.tenant_id || ':' || NEW.evento_turma_id,
    json_build_object(
      'checkinId', NEW.id,
      'convidadoId', NEW.convidado_id,
      'realizadoEm', NEW.realizado_em
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER checkin_notify AFTER INSERT ON checkins
  FOR EACH ROW EXECUTE FUNCTION notify_checkin();
```

### 15.3 Função de soft-delete cascade

Em vez de `ON DELETE CASCADE` físico, usar update em cascata para `deleted_at` (manter histórico):

```sql
CREATE OR REPLACE FUNCTION soft_delete_formando_cascade() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE convidados SET deleted_at = NEW.deleted_at WHERE formando_id = NEW.id AND deleted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER formando_soft_delete_cascade AFTER UPDATE OF deleted_at ON formandos
  FOR EACH ROW EXECUTE FUNCTION soft_delete_formando_cascade();
```

---

## 16. Mapeamento campo-a-campo legado → novo

> **Uso:** o script ETL em `tools/etl-legacy/` consome essa tabela. Cada `cd_*` legado vira `legacyId` no novo, com prefixo identificando a entidade.

### 16.1 Convenção de `legacyId`
Formato: `'<recurso>:<codigo>'` — ex: `'turma:0042'`, `'aluno:1234'`, `'os:0099'`, `'evento:0103'`.

### 16.2 Tabelas (resumo das principais)

#### `faculdade` → `faculdades`
| Legado | Novo | Tipo | Notas |
|---|---|---|---|
| `cd_faculdade` | `legacyId` | `'faculdade:<cd>'` | + `id` UUID |
| `nm_faculdade` | `nome` | string | |
| `mnemonico` | `mnemonico` | string | |
| `sn_ativo` | `ativo` | bool | `'S'` → true |
| `dt_cadastro` | `createdAt` | timestamptz | |

#### `curso` → `cursos`
| Legado | Novo | Tipo | Notas |
|---|---|---|---|
| `cd_curso` | `legacyId` | string | |
| `nm_curso` | `nome` | string | |
| `tipo_curso` | `tipo` | enum `TipoCurso` | mapear strings (`'GRADUACAO'`, etc) |
| `sn_ativo` | `ativo` | bool | |
| `cd_faculdade` | `faculdadeId` | UUID | lookup pelo `legacyId='faculdade:<cd>'` |

#### `turma` → `turmas`
| Legado | Novo | Tipo | Notas |
|---|---|---|---|
| `cd_turma` | `legacyId` | string | |
| `nm_tuma` *(typo)* | `nome` | string | corrige na migração |
| `cd_faculdade` | `faculdadeId` | UUID | nullable (turma "UNIFICADA") |
| `cd_curso` | `cursoId` | UUID | nullable |
| `dt_previsao_formatura` | `dtPrevisaoFormatura` | date | |
| `tp_turno` | `turno` | enum `TipoTurno` | |

#### `aluno` (inferido) → `formandos`
| Legado | Novo | Tipo |
|---|---|---|
| `cd_aluno` | `legacyId` | `'aluno:<cd>'` |
| `nm_aluno` | `nome` | string |
| `cpf` | `cpf` | string |
| `rg` | `rg` | string |
| `telefone` | `whatsapp` | string |
| `cd_turma` | `turmaId` | UUID |

#### `evento` → `eventos_catalogo`
| Legado | Novo | Tipo | Notas |
|---|---|---|---|
| `cd_evento` | `legacyId` | string | |
| `nm_evento` | `nome` | string | |
| `sn_qtde` | `controlaQtde` | bool | |
| `sn_qtde_convidado` | `controlaQtdeConvidado` | bool | |
| (derivar de `nm_evento`) | `categoria` | enum `CategoriaEvento` | regra: nome contém "BAILE"→FESTA, "FOTO"→FOTOGRAFIA, "COLAÇÃO"→CERIMONIA, etc |
| (derivar de `nm_evento`) | `fotosEditadasInclusas` | int | regex `(\d+) FOTOS EDITADAS` |

#### `vendedor` → `vendedores`
| Legado | Novo | Tipo |
|---|---|---|
| `cd_vendedor` | `legacyId` | string |
| `nm_vendedor` | `nome` | string |
| `tp_vendedor` | `tipo` | enum `TipoVendedor` |
| `telefone` | `telefone` | string |
| `sn_fotografia` | `isFotografo` | bool |
| `perc_comissao` | `percComissao` | decimal |
| `assessoria_cerimonial` | `isAssessoriaCerimonial` | bool |
| `perc_assessoria_cerimonial` | `percAssessoriaCerimonial` | decimal |
| `tp_assessoria_cerimonial` | `tpAssessoriaCerimonial` | string |

#### `responsavel` → `responsaveis`
| Legado | Novo |
|---|---|
| `cd_responsavel` | `legacyId` |
| `nm_responsavel` | `nome` |
| `email` | `email` |
| `whatsapp` | `whatsapp` |
| `sms` | `sms` |
| `cd_responsavel_funcao[]` | via `responsaveis_funcoes` (N:N) |

#### `usuario` → `usuarios` + `usuario_permissoes`
| Legado | Novo | Notas |
|---|---|---|
| `cd_usuario` | `legacyId` | `'usuario:<cd>'` |
| `nm_usuario` | `nome` | |
| `sn_ativo` | `ativo` | |
| `menu_tabela=S` | `usuario_permissoes` | row `(recurso='cadastros', acao='read')` |
| `menu_turma=S` | idem | `(recurso='turmas', acao='read')` |
| `menu_aluno=S` | idem | `(recurso='formandos', acao='read')` |
| `menu_painel=S` | idem | `(recurso='dashboard', acao='read')` |
| `menu_servico=S` | idem | `(recurso='os', acao='read')` |
| `menu_brinde=S` | idem | `(recurso='brindes', acao='read')` |
| `menu_relatorio=S` | idem | `(recurso='reports', acao='read')` |
| `menu_usuario=S` | idem | `(recurso='usuarios', acao='read')` |

> Para o ADMIN do legado (todos `menu_*=S`), atribuir `tipo=ADMIN_TENANT` e omitir linhas em `usuario_permissoes` (curinga `*`).

#### `os` → `os` + `os_comentarios` + `os_anexos`
| Legado | Novo |
|---|---|
| `cd_os` | `legacyId` + `numero` (extrai dígitos) |
| `cd_turma` | `turmaId` |
| `cd_setor` | (deprecado — virou `area_id`) |
| `cd_area_responsavel` | `areaId` |
| `cd_tipo_os` | `tipoId` |
| `nm_solicitante` | `solicitanteUsuarioId` (lookup por nome → fallback texto livre em `titulo`) |
| `dt_periodo01` | `dtAbertura` |
| `dt_periodo02` | `dtPrevista` |
| `cd_situacao_os` | `situacaoId` |
| `tp_prioridade` | `prioridade` enum |

#### `os_area_responsavel` → `os_areas_responsavel`
| Legado | Novo |
|---|---|
| `cd_area_responsavel` | `legacyId` |
| `nm_area_responsavel` | `nome` |
| `sn_abrir_os` | `podeAbrirOS` |

#### `os_tipo_os` → `os_tipos`
| Legado | Novo |
|---|---|
| `cd_tipo_os` | `legacyId` |
| `ds_tipo_os` | `descricao` |
| `cd_area_responsavel` | `areaId` |
| `nr_previsao` | `nrPrevisaoDias` |

#### `os_situacao_os` → `os_situacoes`
| Legado | Novo |
|---|---|
| `cd_situacao_os` | `legacyId` |
| `ds_situacao_os` | `descricao` |
| `tp_situacao` | `tipo` enum `TipoSituacaoOS` |

#### `nota_fiscal` → `notas_fiscais`
| Legado | Novo |
|---|---|
| `nr_nfe` | `numero` |
| `cd_aluno` | `formandoId` (lookup `legacy_id='aluno:<cd>'`) |
| `dt_emissao` | `dtEmissao` |
| (CPF, Email vistos no listing) | `cpfDestinatario`, `emailDestinatario` |

#### `produto` → `produtos`
| Legado | Novo |
|---|---|
| `cd_produto` | `legacyId` |
| `nm_produto` | `nome` |
| `tp_produto` | `tipo` |
| `ds_produto` | `descricao` |
| `sn_ativo` | `ativo` |

#### `produto/tabela` → `produto_precos`
| Legado | Novo |
|---|---|
| `cd_tabela_prod_serv` | parte do `legacyId` |
| `cd_produto` | `produtoId` |
| `vl_custo` | `vlCusto` |
| `vl_venda` | `vlVenda` |
| `ano_vigente` | `anoVigente` |

#### `cerimonial` + `tabela_cerimonial` → `cerimoniais` + `cerimoniais_itens`
Mapear composição de produtos com tipo, vl_custo, vl_venda.

#### `entrega` → `entregas_catalogo`
| Legado | Novo |
|---|---|
| `cd_entrega` | `legacyId` |
| `nm_forma` | `nome` |
| `vl_custo` | `vlCusto` |
| `vl_venda` | `vlVenda` |
| `ano_vigente` | `anoVigente` |
| `link` | `link` |
| `userfile` | `arquivoUrl` (após upload R2) |
| (derivar) | `tipo` enum `TipoEntrega` (regex) |

#### `brinde` → `brindes_catalogo` + `brindes_turma`
Catálogo + N por turma.

#### `status` → `status_foto_catalogo`
Mapeia 7 status fixos do legado para enum `StatusFoto`.

#### `Modelos` (`/Modelos`) → `doc_modelos` + `doc_modelo_versoes`
| Legado | Novo |
|---|---|
| `cd_doc_modelo` | `legacyId` |
| `nm_doc_modelo` | `DocModelo.nome` |
| `ds_modelo` | `DocModeloVersao.conteudoHtml` |
| `cd_doc_modelo_versao` | `versao` |

#### `Config` → `config_parametros` + secrets externos
| Legado | Destino |
|---|---|
| `tp_sistema` | `config_parametros` |
| `valida_tag_nfe` | `config_parametros` |
| `ventus_sn_log` | `config_parametros` |
| `ventus_novo_link_aluno` | `config_parametros` (até decidir migração) |
| `assas_key` | **NUNCA** vai pro DB → vai pro secret store, registrar `tenants.asaasSecretRef` |
| `zapsign_*` | idem |
| `kentro_key` | idem |

---

## 17. Pendências para o cliente

Para fechar a Etapa 3 com 100% de fidelidade, Ventus precisa providenciar:

| # | Item | Bloqueio |
|---|---|---|
| 1 | **Dump SQL real** do MySQL legado | Sem ele, o schema atual é "inferido". Pode ter colunas não vistas em forms. |
| 2 | **Schema completo de `aluno`** (não foi achado um form `/aluno` no scraping) | Confirmar se há campos como dt_nascimento, endereço, etc. |
| 3 | **Schema completo de `nota_fiscal`** (só vista listagem) | Volume de campos por NFe (ICMS, ISS, alíquotas?) |
| 4 | **Estrutura real de `evento_turma`, `brinde_turma`, `compromisso`** | Inferida — confirmar |
| 5 | **Estrutura real de `tabela_cerimonial`, `tabela_cerimonial_item`** | Idem |
| 6 | **Schema do `Mensageiro` legado** | Bloqueia merge de histórico de comunicação |
| 7 | **Definir o que é Kentro** | Pode adicionar entidade |
| 8 | **Política de retenção** específica por entidade | Soft-delete cascade vs hard-delete fiscal (5y) vs LGPD esquecimento |
| 9 | **Templates Meta-aprovados** (10 templates) | `templates_mensagem.metaApprovedTemplate` |
| 10 | **Volume real previsto** por entidade nos próximos 12m | Capacity planning de partições futuras |

---

**Status:** Etapa 3 concluída.
**Próxima:** Etapa 4 — Mapa de funcionalidades antigo vs novo.
