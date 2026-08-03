# 04 — Roadmap MVP

## 4.1 Filosofia de priorização

**Princípio:** entregar valor de cima pra baixo do funil — começar pelo módulo que **gera receita imediata** e o que **mais dói** na operação atual, depois expandir.

**Ordem recomendada:**

1. 🥇 **Módulo 4 — Fotografia + WhatsApp** (maior diferencial competitivo, core da Ventus)
2. 🥈 **Módulo 1 — Vendas e Pagamento** (gera receita e organiza financeiro)
3. 🥉 **Módulo 3 — Controle de Acesso** (alta visibilidade no dia do evento)
4. 🏅 **Módulo 2 — Divulgação e Convidados** (consolida a operação)

**Por que começar pela foto?**
- É o produto principal da Ventus (estúdio próprio + fotógrafos qualificados é diferencial declarado)
- Maior dor operacional hoje (separar fotos por aluno manualmente)
- Maior wow-factor para o aluno (recebe link no WhatsApp)
- Vendedor natural para conquistar próximas turmas

---

## 4.2 Fases

### 🚀 Fase 0 — Setup (Semana 1-2)

**Entregas:**
- [ ] Repositório Git criado e estruturado (monorepo pnpm)
- [ ] Vercel + Railway + Supabase + Cloudflare R2 provisionados
- [ ] Tenant Ventus criado no banco com seed inicial
- [ ] CI/CD básico (lint, typecheck, deploy automático)
- [ ] Design tokens Ventus configurados (azul, branco, tipografia)
- [ ] Documentação revisada e validada com Elison

**Critério de saída:** "Hello World" Ventus rodando em domínio público com DB conectado.

---

### 📸 Fase 1 — Módulo 4 (Fotografia + WhatsApp) — 4-6 semanas

**Por quê primeiro:** maior diferencial + maior dor.

**Entregas funcionais:**
- [ ] **Portal do fotógrafo:** upload em massa de fotos por evento
- [ ] **Worker de processamento:** integração AWS Rekognition para face matching
- [ ] **Cadastro de foto de referência** do formando (selfie no onboarding)
- [ ] **Galeria do formando:** vê apenas as fotos onde aparece (filtradas por face)
- [ ] **Sistema de créditos:** aluno seleciona N fotos (limitado pelo pacote)
- [ ] **Portal do editor:** fila de seleções, marcar "em edição" → "finalizada"
- [ ] **Upload da versão editada:** sistema substitui galeria automaticamente
- [ ] **Disparo WhatsApp via Z-API:** template aprovado pela Meta com link da galeria final

**Não entra na Fase 1:**
- ❌ Vídeos (só fotos no MVP)
- ❌ Marcação manual de pessoas (só face automático)
- ❌ Compra de fotos extras (limitado ao pacote)

**Critério de saída:**
- 1 evento real (cerimônia ou ensaio) processado fim a fim
- 5+ alunos receberam WhatsApp com fotos editadas
- Tempo médio upload→entrega < 24h

---

### 💰 Fase 2 — Módulo 1 (Vendas e Pagamento) — 3-4 semanas

**Entregas:**
- [ ] **Cadastro de pacotes** por turma (admin)
- [ ] **Geração de contrato** + assinatura digital simples (aceite + IP + timestamp)
- [ ] **Integração Asaas:** criação de cliente, gera link de pagamento, parcela em até 21x
- [ ] **Webhook Asaas:** atualiza status de cobrança em tempo real
- [ ] **Portal financeiro do formando:** parcelas, vencimento, link Pix/boleto
- [ ] **Dashboard do admin:** total a receber, inadimplentes, projeção mensal
- [ ] **Notificações de cobrança:** WhatsApp 7 dias antes, no dia, e 3 dias depois (atraso)

**Critério de saída:**
- Turma piloto com 30+ formandos pagando via plataforma
- Inadimplência < 10%
- Tempo médio de "decisão→pagamento" < 24h

---

### 🎟️ Fase 3 — Módulo 3 (Controle de Acesso) — 2-3 semanas

**Entregas:**
- [ ] **Portal Ventus:** gerar QR para cada convidado já cadastrado
- [ ] **Disparo de convite via WhatsApp:** mensagem com QR embutido
- [ ] **App de check-in (web responsivo em tablet):** câmera + leitor QR
- [ ] **Print server local:** Node.js daemon que recebe job de impressão
- [ ] **Integração Zebra ZD510-HC:** ZPL com nome + QR + cor por categoria
- [ ] **Modo offline:** fila local de check-ins quando internet cai
- [ ] **Dashboard de portaria:** quantos confirmados / quantos chegaram

**Critério de saída:**
- Evento real com 100+ convidados, check-in em <5s por pessoa
- Pulseiras impressas com nome correto, sem erro

---

### 📣 Fase 4 — Módulo 2 (Divulgação e Convidados) — 2-3 semanas

**Entregas:**
- [ ] **Cadastro de convidados pelo formando** (respeitando cota do pacote)
- [ ] **Envio de convite digital via WhatsApp** com QR único
- [ ] **RSVP web sem login:** convidado clica e confirma
- [ ] **Motor de campanhas timed:** D-90, D-30, D-7, D-1 com templates
- [ ] **Editor de mensagens:** admin Ventus customiza templates por turma
- [ ] **Dashboard de comissão:** % de confirmações, lembretes pendentes

**Critério de saída:**
- Turma piloto roda 100% das comunicações pré-evento via plataforma
- 80%+ dos convidados confirmam presença antes do evento

---

### 🎨 Fase 5 — Polimento e Hardening (2-3 semanas)

**Entregas:**
- [ ] Testes E2E nos 4 módulos (Playwright)
- [ ] Observabilidade: Sentry + PostHog plugados, dashboards montados
- [ ] LGPD: termos de consentimento, exportação de dados, exclusão
- [ ] Documentação do usuário (manuais por persona)
- [ ] Treinamento da equipe Ventus
- [ ] Backup e disaster recovery testados

---

## 4.3 Linha do tempo total estimada

```
S1-S2  : Setup
S3-S8  : Fase 1 - Foto/WhatsApp     ████████████
S9-S12 : Fase 2 - Vendas             ████████
S13-S15: Fase 3 - Acesso              ██████
S16-S18: Fase 4 - Divulgação           ██████
S19-S21: Fase 5 - Polimento             ██████
                                            ▲
                                            └ MVP completo: ~5 meses
```

**Janela ideal de piloto:** alinhar entrega da Fase 1 com a próxima formatura real da Ventus para validar com volume real.

---

## 4.4 Riscos e mitigações

| Risco | Impacto | Probab. | Mitigação |
|---|---|---|---|
| AWS Rekognition cara em escala | Alto | Médio | Cache de embeddings, processar só fotos com pessoas (filtro prévio), migrar para InsightFace na v2 |
| Z-API muda preço/política | Médio | Médio | Adapter pattern: trocar BSP em 1 sprint |
| Cliente Ventus não tem hardware Zebra | Médio | Alto | **Aluguel** de impressora para piloto (~R$ 200/dia) |
| LGPD: aluno reclama de face recognition | Alto | Baixo | Consentimento explícito + opt-out (aluno usa galeria sem face match, vê tudo) |
| Internet ruim no salão de evento | Alto | Médio | Print server local + cache offline + 4G backup |
| Time SENAI fica preso em algum domínio | Alto | Médio | Specs detalhadas + arquiteto disponível semanal |
| Front-end IA gera código inconsistente | Médio | Alto | Design system rígido + revisão obrigatória + componentes shadcn fixos |

---

## 4.5 Definição de "pronto" (DoD)

Para qualquer feature ser considerada done:
- [x] Implementada conforme spec do módulo
- [x] Testes unitários nos serviços críticos (>70% cobertura backend)
- [x] Teste E2E feliz path
- [x] Type check + lint passando
- [x] Deploy em staging e validado pelo arquiteto
- [x] Logs e métricas configurados
- [x] Documentação atualizada
- [x] Aprovação do Elison/cliente

---

## 4.6 Decisões pendentes (precisam de Elison)

- [ ] Domínio definitivo (subdomínio de ventusformaturas.com.br ou domínio novo?)
- [ ] Confirmar nome do produto (ex: "Ventus Connect", "Portal Ventus", outro?)
- [ ] Volume previsto de turmas em 2026 (para dimensionar infra)
- [ ] Quem será o ponto focal técnico do lado Ventus (responder dúvidas do time)
- [ ] Compra de impressora Zebra ou aluguel inicial?
- [ ] Conta Asaas: já tem ou precisa criar?
- [ ] Conta Z-API: já tem ou precisa criar?
- [ ] Quem assina contratos LGPD com formandos (pessoa jurídica = Ventus)?
