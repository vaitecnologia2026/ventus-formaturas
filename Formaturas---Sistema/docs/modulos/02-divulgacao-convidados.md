# Módulo 2 — Divulgação e Cadastro de Convidados

## 2.1 Objetivo

Criar engajamento e expectativa nos formandos durante todo o ciclo da formatura, e organizar o cadastro dos convidados que cada aluno tem direito segundo seu pacote.

## 2.2 Funcionalidades

### F2.1 — Motor de campanhas timed
- Campanhas configuráveis por turma com gatilho temporal:
  - **D-180** (assinatura): "Bem-vindo! Sua jornada começa agora 🎓"
  - **D-90**: "Faltam 90 dias para sua formatura!"
  - **D-30**: "Próximo passo: cadastre seus convidados"
  - **D-7**: "Confira tudo: dress code, horário, local"
  - **D-1**: "É amanhã! Veja últimos detalhes"
  - **D+1**: "Que noite incrível! Aguarde suas fotos 📸"
- Templates customizáveis por admin Ventus
- Variáveis substituídas em tempo de envio: `{nome_aluno}`, `{data_evento}`, `{nome_turma}`

### F2.2 — Cadastro de convidados pelo formando
- Aluno vê cota disponível (ex: "2 de 4 convidados cadastrados")
- Cadastra convidado com: nome completo, CPF (opcional), telefone (opcional para enviar convite)
- Edita ou remove até D-7 do evento
- Após D-7 fica **bloqueado** (mudanças via solicitação à comissão)

### F2.3 — Envio de convite digital
- Quando aluno cadastra convidado com telefone, sistema dispara WhatsApp com:
  - Nome do convidado
  - Nome do formando
  - Data, hora, local do evento
  - Mapa (link Google Maps)
  - **QR Code único** para entrada
  - Botão "Confirmar presença" (RSVP)
- Convidado pode reencaminhar a mensagem para outros familiares (link único, intransferível)

### F2.4 — RSVP web sem login
- Convidado clica no link → página com:
  - Detalhes do evento
  - Botões: ✅ "Confirmo presença" / ❌ "Não posso ir" / 🤔 "Vou avisar"
  - Campo de observação (alergia alimentar, mobilidade reduzida, etc.)
- Status volta para o painel do formando e da comissão em tempo real

### F2.5 — Painel da comissão
- Visualiza progresso de RSVP da turma toda
- "Quem ainda não confirmou": botão para reenviar lembrete
- Lista de pedidos especiais (mobilidade, dieta, etc.)
- Estatística: % confirmados, esperados, recusados

### F2.6 — Conteúdo de "criação de expectativa"
- Página da turma com:
  - Capa personalizada (foto do grupo)
  - Countdown grande "X dias até a formatura"
  - Galeria de fotos de bastidores (ensaio, eventos prévios)
  - Stories curtas: "Conheça a comissão", "Sobre o salão", "Quem vai tocar"
- Compartilhável via WhatsApp/Instagram

### F2.7 — Comunicação ad-hoc
- Comissão envia recados pontuais para a turma toda (via WhatsApp + email)
- Templates rápidos: "Mudança de horário", "Aviso importante"
- Aprovação prévia do admin Ventus (evitar spam)

## 2.3 Telas

### Formando (PWA)

| Tela | Descrição |
|---|---|
| **Página da turma** | Hero com countdown + galeria de bastidores + cronograma |
| **Meus convidados** | Lista de convidados + botão "Adicionar convidado" |
| **Cadastrar convidado** | Form com nome, telefone, parentesco; envia convite ao salvar |
| **Detalhe do convidado** | Status RSVP + botão reenviar |

### Convidado (mobile, sem login)

| Tela | Descrição |
|---|---|
| **Convite digital** | Card com nome do formando, data, local, mapa, QR |
| **RSVP** | Botões grandes Confirmo/Não posso/Vou avisar + campo observação |
| **Confirmação** | "Estamos te esperando! 🎉" + adicionar ao calendário |

### Comissão (web)

| Tela | Descrição |
|---|---|
| **Painel turma** | Progresso RSVP + alertas + ações em massa |
| **Lista de convidados** | Filtros por aluno, status, observações |
| **Comunicação** | Envio de recados com aprovação |

### Admin Ventus (web)

| Tela | Descrição |
|---|---|
| **Editor de campanhas** | CRUD de campanhas + preview WhatsApp |
| **Templates de mensagem** | Biblioteca de templates aprovados pela Meta |
| **Relatório de engajamento** | Open rate, click rate, conversão de RSVP |

## 2.4 Regras de negócio

- **Cota de convidados** vem do pacote contratado pelo aluno
- **Trocas:** aluno pode substituir convidado até D-7 (cancelar e cadastrar outro)
- **Sobras:** se aluno não usa toda a cota, comissão pode redistribuir entre quem precisa de mais (com aprovação)
- **Crianças:** menores de 12 anos não contam na cota (configurável por turma)
- **Acompanhantes:** sempre 1:1 (cada convidado é uma pessoa)

## 2.5 Integrações

- **Z-API (WhatsApp):** templates aprovados
  - `convite_evento` — variáveis: nome_convidado, nome_formando, data, local, link_rsvp, qr_url
  - `lembrete_rsvp` — variáveis: nome_convidado, dias_evento, link
  - `confirmacao_recebida` — variáveis: nome_convidado
  - `dia_evento` — variáveis: nome, hora, local, mapa
- **Google Maps:** links de mapa nos convites
- **Email transacional** (Resend ou SendGrid) — fallback se WhatsApp falhar

## 2.6 Critérios de aceite

- [ ] Campanha agendada dispara no horário programado (±5 min)
- [ ] Convidado recebe WhatsApp em <30s do cadastro
- [ ] RSVP atualiza painel em tempo real (<3s)
- [ ] Comissão visualiza % de confirmação atualizado
- [ ] Admin pode pausar/reativar campanha
- [ ] Templates respeitam regras da Meta (sem spam, com opt-out)

## 2.7 Métricas

- Taxa de RSVP confirmado / total convidados (meta: >80%)
- Tempo médio entre envio do convite e confirmação
- Taxa de abertura de mensagens WhatsApp
- Engajamento na página da turma (visitas, tempo médio)
- Taxa de redistribuição de cotas
