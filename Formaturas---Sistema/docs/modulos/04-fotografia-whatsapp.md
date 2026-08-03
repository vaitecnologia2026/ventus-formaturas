# Módulo 4 — Fotografia + Crédito + WhatsApp ⭐

> **Este é o módulo principal e o maior diferencial competitivo da Ventus.**

## 4.1 Objetivo

Substituir o processo manual de "fotógrafo entrega arquivos → equipe separa por aluno → aluno recebe link com tudo → escolhe → editor edita → entrega manual" por uma **esteira automatizada com reconhecimento facial e entrega via WhatsApp**.

**A "experiência perfeita" prometida ao formando:**

> "Você recebe um WhatsApp com link das suas fotos. Vê só onde você aparece. Escolhe suas favoritas. Em poucos dias, recebe outro WhatsApp com as fotos editadas, prontas pra postar."

## 4.2 Funcionalidades

### F4.1 — Cadastro de foto de referência (onboarding)
- Aluno tira/envia uma selfie no primeiro acesso (ou usa foto do contrato)
- Sistema processa via AWS Rekognition → gera embedding facial 512d
- Embedding salvo na tabela `formandos.embeddingFacial`
- Aluno pode atualizar foto de referência se quiser
- **Consentimento LGPD explícito** antes do processamento (dado biométrico)

### F4.2 — Upload em massa pelo fotógrafo
- Portal do fotógrafo com drag-and-drop de até 5GB por sessão
- Upload paralelo direto para R2 (presigned URLs)
- Cada foto pertence a uma `Galeria` do `Evento` (ex: "Cerimônia", "Mesas", "Pista")
- Geração automática de thumbnails (300px webp)
- EXIF preservado (data/hora, câmera, lente)
- **Máximo recomendado:** 2000 fotos por evento (limite técnico, não rígido)

### F4.3 — Worker de processamento facial
- Job na fila `photos-process` para cada foto upload
- Worker:
  1. Lê foto do R2
  2. Detecta rostos via Rekognition (`DetectFaces`)
  3. Para cada rosto, busca match nos embeddings dos formandos da turma (`SearchFacesByImage`)
  4. Cria registro em `fotos_formandos` com `similarityScore`
  5. Marca `Foto.faceProcessada = true`
- Threshold padrão: similaridade ≥ 80% (configurável)
- Múltiplas pessoas em uma foto = múltiplos registros

### F4.4 — Galeria personalizada do formando
- Aluno entra no portal e vê **APENAS fotos onde aparece**
- Agrupadas por `Galeria` do evento (Cerimônia, Mesas, Pista)
- Ordenadas por timestamp
- Indicador visual: "✨ X fotos novas" desde último acesso
- Compartilhamento de prévia (sem download HD) via link público temporário

### F4.5 — Sistema de créditos / seleção
- Cada formando tem `creditosFotosTotal` (do pacote, ex: 50 fotos)
- Aluno seleciona fotos clicando em "❤️ Selecionar para edição"
- Contador visual: "Você selecionou 23/50 fotos"
- Não pode passar do limite (botão desabilita)
- Pode desselecionar (devolve crédito)
- Botão "Finalizar seleção" envia tudo para fila de edição

### F4.6 — Fila de edição (portal do editor)
- Editor vê lista de seleções com status `SELECIONADA`
- Filtros: por turma, por evento, por urgência
- Editor pega lote (10-50 fotos) → status muda para `EM_EDICAO`
- Workflow:
  1. Editor baixa o pacote (ZIP com originais)
  2. Edita no Lightroom/Photoshop (offline)
  3. Faz upload das versões editadas (mantendo nome do arquivo)
  4. Marca lote como **"Finalizado"**
- Sistema valida: cada selecionada tem versão editada correspondente
- Status muda para `FINALIZADA` automaticamente

### F4.7 — Auto-deploy ao galeria
- Quando lote vai para `FINALIZADA`:
  - Sistema sobe versões editadas para `Foto.storageKeyEditada` no R2
  - Marca como pronta para entrega
- Fotos editadas substituem originais na visualização do aluno (mas originais ficam preservadas)

### F4.8 — Entrega via WhatsApp (a magia)
- Worker `comm-deliver` roda quando há fotos finalizadas
- Para cada formando com fotos finalizadas:
  - Gera link único da galeria final (token assinado)
  - Dispara WhatsApp com template `fotos_prontas`:

```
🎉 Olá [NOME]!

Suas fotos editadas estão prontas! ✨

📸 [QTD] fotos lindas, escolhidas por você e editadas com carinho.

Clique aqui para baixar todas em alta resolução:
👉 [LINK_GALERIA]

Compartilhe com sua família e nas redes! Bora celebrar?

Obrigado por confiar em nós,
Equipe Ventus 💙
```

- Link da galeria abre PWA mobile-first com:
  - Galeria visual em grid
  - Botão "Baixar todas em ZIP"
  - Botão "Compartilhar" (WhatsApp/Instagram)
  - Métricas de impacto (qual foto foi mais baixada)

### F4.9 — Dashboard do fluxo de produção (admin Ventus)
- Funil em tempo real:
  - X fotos uploadadas
  - Y processadas pela IA
  - Z selecionadas pelos alunos
  - W em edição
  - V entregues
- Tempo médio em cada etapa
- Alertas: "Fotos em edição há mais de 5 dias"
- Lista de alunos por status: aguardando galeria / aguardando seleção / aguardando edição / entregue

### F4.10 — Solicitação de fotos extras
- Aluno pode comprar créditos extras (R$ X por foto)
- Pagamento via Asaas (mesma integração do Módulo 1)
- Após pagamento, créditos liberam automaticamente

## 4.3 Telas

### Formando (PWA — mobile-first)

| Tela | Descrição |
|---|---|
| **Onboarding foto** | "Tire uma selfie pra gente reconhecer você" + termos LGPD |
| **Hub fotos** | "✨ X fotos novas! • Você selecionou Y/Z" |
| **Galeria** | Grid 2-3 colunas + filtro por evento + favoritar |
| **Detalhe foto** | Tela cheia + swipe + "Selecionar p/ edição" |
| **Resumo de seleção** | Lista das selecionadas + botão "Finalizar" |
| **Pós-finalização** | "Seu pedido está sendo editado, aguarde 3-5 dias" |
| **Galeria final** | Após edição: grid de fotos editadas + download ZIP |

### Fotógrafo (web)

| Tela | Descrição |
|---|---|
| **Lista de eventos** | Eventos atribuídos ao fotógrafo |
| **Upload em massa** | Drag-and-drop com progress bar |
| **Galeria do evento** | Visualizar todas as fotos uploadadas |
| **Status processamento** | "X de Y fotos processadas pela IA" |

### Editor (web)

| Tela | Descrição |
|---|---|
| **Fila** | Lista de pacotes para edição com prioridade |
| **Detalhe do pacote** | Lista de fotos + botão "Pegar pacote" + download ZIP |
| **Em edição** | Pacotes que peguei + botão "Upload finalizado" |
| **Histórico** | Pacotes já entregues |

### Admin Ventus (web)

| Tela | Descrição |
|---|---|
| **Funil de produção** | Visualização ponta a ponta (upload → entrega) |
| **Lista de eventos** | Status de cada evento (galeria, processamento, entrega) |
| **Configurar pacotes** | Quantos créditos/fotos por pacote |
| **Relatório de qualidade** | NPS pós-entrega + métricas |

## 4.4 Regras de negócio

- **Threshold de match facial:** padrão 80%, configurável globalmente
- **Múltiplos rostos por foto:** todos os formandos detectados ganham acesso à mesma foto
- **Foto sem rosto detectado:** vai para galeria "Geral" (todos veem) — comum em fotos de detalhe (mesas, decoração)
- **Aluno opta por desativar face matching:** vê todas as fotos do evento (sem filtro) — ainda respeita créditos
- **Limite de seleção:** estrito, não pode passar do pacote (sem extras pagos primeiro)
- **Prazo de seleção:** 30 dias após galeria liberada (depois disso, créditos não usados expiram)
- **Prazo de edição:** target 3-5 dias úteis após finalizar seleção
- **Garantia:** se aluno não gostar do resultado, pode pedir 1 retoque por foto (sem custo)

## 4.5 Integrações

### AWS Rekognition
- **Operações usadas:**
  - `IndexFaces` — adiciona embedding do formando à coleção
  - `DetectFaces` — encontra rostos em foto nova
  - `SearchFacesByImage` — busca matches numa coleção
- **Coleção por evento ou por turma:** decisão de design — começar **por turma** (mais simples, menor coleção)
- **Custo:** ~$1/1000 imagens analisadas

### Cloudflare R2
- **Bucket por tenant:** `ventus-fotos-prod`, `ventus-fotos-edited`
- **Presigned URL** para upload direto do navegador
- **Lifecycle:** fotos originais expiram em 365 dias após entrega final (regulamento LGPD + economia)

### Z-API (WhatsApp)
- Templates aprovados pela Meta:
  - `galeria_pronta` — disparo quando galeria é liberada
  - `selecao_recebida` — confirmação ao aluno após finalizar seleção
  - `fotos_finalizadas` — entrega final com link

### Sharp (processamento de imagem)
- Geração de thumbnails (300px webp)
- Otimização de fotos para preview (1200px qualidade 80%)

## 4.6 Critérios de aceite

- [ ] Upload de 1000 fotos completa em <15 minutos
- [ ] Processamento facial de 1000 fotos completa em <30 minutos
- [ ] Aluno entra na galeria e vê apenas suas fotos (precisão >90%)
- [ ] Seleção respeita limite de créditos
- [ ] Editor recebe pacote organizado e nomeado
- [ ] Versão editada substitui original na visualização do aluno
- [ ] WhatsApp de entrega chega em <5 minutos do "finalizado"
- [ ] Link de galeria final abre em PWA mobile com download ZIP
- [ ] Funil admin atualiza em tempo real

## 4.7 Métricas (norte verdadeiro do produto)

| Métrica | Meta MVP | Meta v2 |
|---|---|---|
| **Tempo upload → galeria liberada** | < 24h | < 2h |
| **Tempo seleção → edição entregue** | < 5 dias | < 2 dias |
| **Precisão do face match (% relevante)** | > 90% | > 95% |
| **Taxa de seleção (alunos que selecionam de fato)** | > 70% | > 85% |
| **NPS pós-entrega final** | > 60 | > 80 |
| **% alunos que compram fotos extras** | — | > 20% |
| **Taxa de retoque solicitado** | < 10% | < 5% |

## 4.8 Considerações especiais

### LGPD
- **Embedding facial = dado biométrico = categoria especial** (Art. 11 LGPD)
- Consentimento explícito obrigatório antes de processar
- Aluno pode solicitar exclusão a qualquer momento → embedding é hard-deleted
- Auditoria: toda operação de face é logada em `lgpd_eventos`

### Custo
- Rekognition no MVP: ~R$ 5-15 por evento (1000 fotos × $0.001 = $1)
- Storage R2: ~R$ 0,07/GB/mês (5MB × 1000 = 5GB = R$ 0,35)
- WhatsApp: ~R$ 0,30 por mensagem template
- **Total estimado por evento:** R$ 50-100 (vs hora de funcionário separando manualmente)

### Acessibilidade
- Aluno com deficiência visual: descrição alternativa em fotos selecionadas (opcional)
- Daltônicos: indicadores visuais não dependem só de cor

### Plano B se Rekognition falhar
- Fallback manual: admin Ventus marca presença do aluno em fotos
- Fallback do aluno: ver galeria sem filtro e selecionar tudo
