# Front-end Spec — Para Time de IA / Prompt Engineering

> **Audiência:** time interno especializado em V0/Lovable/Bolt e prompt engineering.
> **Objetivo:** dar materiais e regras suficientes para o time gerar telas consistentes via IA, mantendo branding Ventus e arquitetura unificada.

---

## 1. Stack obrigatório (não negociável)

```
Next.js 15 (App Router)
TypeScript (strict mode)
Tailwind CSS v4
shadcn/ui (componentes pré-construídos)
Lucide React (ícones)
Zustand (state global pequeno)
TanStack Query (server state)
React Hook Form + Zod (formulários)
```

**Por quê não negociável:**
- V0, Lovable e Bolt geram exatamente este stack por padrão → **integração perfeita** com a metodologia AI-first
- shadcn/ui é a base — qualquer componente customizado deve ser baseado nele

---

## 2. Design Tokens Ventus

### Cores

```css
/* Primárias (azul Ventus) */
--primary-50: #EFF6FF;
--primary-100: #DBEAFE;
--primary-500: #3B82F6;
--primary-600: #2563EB;  /* CTA padrão */
--primary-700: #1D4ED8;
--primary-900: #1E3A8A;  /* azul Ventus escuro */

/* Neutros */
--gray-50: #F9FAFB;
--gray-100: #F3F4F6;
--gray-500: #6B7280;
--gray-900: #111827;

/* Semânticas */
--success: #10B981;
--warning: #F59E0B;
--danger:  #EF4444;
--info:    #3B82F6;

/* Categorias de pulseira */
--vip:       #FBBF24;  /* dourado */
--comum:     #2563EB;  /* azul Ventus */
--comissao:  #DC2626;  /* vermelho */
--imprensa:  #6B7280;  /* cinza */
```

### Tipografia

```
Display: Geist (Vercel) ou Inter — para títulos
Body:    Inter — para texto corrido
Mono:    Geist Mono — para códigos/QR/IDs

Tamanhos:
  Hero:    text-5xl sm:text-7xl (countdown)
  H1:      text-3xl sm:text-4xl
  H2:      text-2xl sm:text-3xl
  H3:      text-xl
  Body:    text-base
  Small:   text-sm
  Caption: text-xs
```

### Espaçamento

```
Padding mínimo em mobile: px-4 py-6
Padding em desktop:        px-8 py-12
Gap entre seções:          space-y-12
Gap dentro de seção:       space-y-4
Border radius:             rounded-xl (8px) padrão | rounded-2xl em cards principais
```

### Sombras e elevação

```
Card:       shadow-sm
Modal:      shadow-2xl
Botão hover: shadow-md
```

---

## 3. Voz e Tom

| Para | Tom |
|---|---|
| **Formando** | Caloroso, motivacional, com emojis (🎓 ✨ 📸 🎉). Tratar como protagonista. |
| **Convidado** | Acolhedor, claro, prático. Pouco emoji. |
| **Operador (portaria)** | Direto, sem floreio. Foco em ação. |
| **Admin Ventus** | Técnico, profissional. Sem emoji em interfaces de relatório. |
| **Erros** | Empáticos, com solução. Nunca culpar o usuário. |

**Exemplos:**
- ✅ "Suas fotos estão prontas! ✨" (formando)
- ❌ "Galeria liberada para visualização." (formando — frio demais)
- ✅ "QR não reconhecido. Tente buscar pelo nome." (operador — solução clara)
- ❌ "ERRO: TOKEN_INVALID" (operador — técnico demais)

---

## 4. Padrões de Componentes (shadcn/ui)

**Sempre usar componentes shadcn quando existirem:**
- `Button` (com variants: default, secondary, destructive, ghost, outline)
- `Card`, `CardHeader`, `CardContent`, `CardFooter`
- `Dialog` (modais)
- `Sheet` (drawer mobile)
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`
- `Form` + `react-hook-form` + `zod`
- `Toast` (notificações via `sonner`)
- `Avatar`, `Badge`, `Separator`, `Skeleton`

**Customizações permitidas:**
- Adicionar variants ao Button para CTA principal Ventus (gradient azul)
- Card com borda sutil em azul para destacar info importante

---

## 5. Layouts Padrão

### Layout Aluno (PWA mobile)

```
┌──────────────────────────────┐
│ [≡] Logo Ventus    [👤Perfil] │  ← Header sticky
├──────────────────────────────┤
│                              │
│   [Conteúdo da página]       │
│                              │
├──────────────────────────────┤
│ [🏠] [📸] [💰] [👥] [⚙️]      │  ← Bottom nav (5 ícones)
└──────────────────────────────┘
```

### Layout Admin Ventus (web desktop)

```
┌─────┬───────────────────────────────────┐
│     │ Breadcrumb           [User Menu]  │
│ Nav │ ──────────────────────────────────│
│     │                                   │
│ Sid │   [Conteúdo da página]            │
│ ebar│                                   │
│     │                                   │
└─────┴───────────────────────────────────┘
```

### Layout Operador (tablet quiosque)

```
┌──────────────────────────────────────┐
│   [LOGO Ventus]      Evento: XYZ     │
├──────────────────────────────────────┤
│                                      │
│        ┌────────────────────┐        │
│        │                    │        │
│        │   CÂMERA ATIVA     │        │
│        │   (centralizada)   │        │
│        │                    │        │
│        └────────────────────┘        │
│                                      │
│   [BUSCAR MANUALMENTE]               │
│                                      │
└──────────────────────────────────────┘
```

---

## 6. Prompts Mestres para IA Front-end

### 🎯 Prompt template (usar como base)

> Você é um designer/dev front-end gerando telas para a **Plataforma Ventus Formaturas**, uma plataforma white-label para gestão de formaturas universitárias.
>
> **Stack:** Next.js 15 (App Router) + TypeScript + Tailwind v4 + shadcn/ui + Lucide.
>
> **Branding:** azul (`#1E3A8A` primário escuro, `#2563EB` CTA) e branco. Fonte: Inter. Tom: caloroso e profissional para alunos, técnico para admins.
>
> **Persona:** [DEFINIR — Formando 22 anos / Admin Ventus / Operador de portaria / etc.]
>
> **Tela:** [DEFINIR — ex: "Galeria personalizada do formando"]
>
> **Comportamento esperado:** [DEFINIR funcionalidades]
>
> **Mobile-first** se for tela do aluno ou convidado. **Desktop-first** se for admin/fotógrafo/editor.
>
> Use componentes shadcn/ui (`Button`, `Card`, `Dialog`, etc). Respeite os tokens Ventus. Inclua estados de loading/erro/vazio.

### 📸 Exemplo de prompt: Galeria do formando

> Persona: João, formando de Enfermagem, 22 anos, mobile-first.
>
> Tela: **Galeria personalizada — fotos onde ele aparece**
>
> Comportamento:
> - Hero: foto destaque (a melhor) + texto "✨ Suas fotos da formatura"
> - Stat row: "X fotos disponíveis • Você selecionou Y de 50"
> - Grid 2 colunas (mobile) / 4 colunas (desktop) de fotos com aspect-square
> - Cada foto: tap abre detalhe em tela cheia
> - Filtro chips horizontais por evento (Cerimônia, Mesas, Pista)
> - Botão flutuante "Finalizar seleção" quando ≥1 foto selecionada
>
> Estados:
> - Loading: skeleton de grid
> - Vazio: ilustração + "Suas fotos chegam em até 24h após o evento"
> - Erro: mensagem amigável + botão retry
>
> Use shadcn `Card`, `Button`, `Badge`. Use Lucide para ícones.

### 🎫 Exemplo de prompt: Tela de check-in operador

> Persona: Operador de portaria, tablet 10", uso intensivo (centenas de check-ins/h).
>
> Tela: **Câmera de QR + impressão automática**
>
> Comportamento:
> - Câmera ocupa 70% da tela (centralizada)
> - Linha de "alvo" para QR aparecer
> - Botão grande inferior "BUSCAR MANUAL" caso QR falhe
> - Ao detectar QR: overlay verde → foto convidado + nome em fonte gigante → "IMPRIMINDO PULSEIRA..." → ✅ "OK, próximo!"
> - Se QR já usado: overlay laranja com warning + botão "PERMITIR MESMO ASSIM (com motivo)"
> - Se QR inválido: overlay vermelho "QR não reconhecido"
>
> Modo quiosque (full-screen, sem distrações). Animações rápidas. Sem scroll.
>
> Use `react-zxing` ou `html5-qrcode` para câmera. Estados gerenciados com Zustand.

---

## 7. Padrões de Acessibilidade (a11y)

- **Contraste mínimo WCAG AA** — texto sobre azul Ventus passa em todos os tokens
- **Touch targets ≥44px** em mobile (botões, ícones de ação)
- **Foco visível** em todos os elementos interativos
- **alt text** descritivo em fotos
- **Form labels** sempre associados ao input
- **Modais com focus trap** (shadcn já faz)
- **Skeleton states** durante carregamento (não só "Loading...")

---

## 8. Performance

- **Imagens:** sempre via `next/image` com `sizes` correto
- **Code splitting:** rotas separadas via App Router (default)
- **Otimizar fotos:** thumbnails 300px webp para grid; full-res lazy load no detalhe
- **Métrica alvo:** LCP < 2.5s, INP < 200ms, CLS < 0.1

---

## 9. Estados Obrigatórios em Toda Tela

Toda tela deve cobrir os seguintes estados:

1. **Loading** — skeleton ou spinner contextual
2. **Empty** — ilustração + texto + CTA (não só "Nenhum dado")
3. **Error** — mensagem amigável + botão retry
4. **Success** — feedback claro (toast ou inline)

Times de IA: **incluam isso em todo prompt**, sem exceção.

---

## 10. Lista de Telas Priorizadas (para Fase 1 — Foto)

Time de IA deve gerar nesta ordem:

### Aluno (PWA)
1. ✅ Onboarding LGPD + foto referência
2. ✅ Login (magic link via WhatsApp)
3. ✅ Hub home (fotos + créditos)
4. ✅ Galeria personalizada (grid)
5. ✅ Detalhe de foto (tela cheia + ações)
6. ✅ Resumo de seleção
7. ✅ Confirmação pós-finalização
8. ✅ Galeria final (após edição)

### Fotógrafo (web)
9. ✅ Lista de eventos
10. ✅ Upload em massa
11. ✅ Status de processamento

### Editor (web)
12. ✅ Fila de pacotes
13. ✅ Detalhe do pacote (download/upload)
14. ✅ Histórico

### Admin Ventus (web)
15. ✅ Dashboard de funil
16. ✅ Lista de eventos com status
17. ✅ Configuração de pacotes
18. ✅ Relatório por turma

---

## 11. Pasta de assets (a ser criada)

```
apps/web/public/
├── ventus-logo.svg          # Logo oficial (azul + branco)
├── ventus-logo-mono.svg     # Versão monocromática
├── og-image.png             # Open Graph
├── favicon.ico
├── apple-touch-icon.png
└── ilustracoes/             # SVGs de empty states
    ├── sem-fotos.svg
    ├── sucesso.svg
    └── erro.svg
```

**Quem fornece:** Ventus deve enviar o logo oficial em SVG. Solicitar ao Elison.

---

## 12. Workflow do Time de IA

```
1. Ler doc do módulo (ex: docs/modulos/04-fotografia-whatsapp.md)
   ↓
2. Identificar tela específica
   ↓
3. Montar prompt usando o template (seção 6)
   ↓
4. Gerar via V0/Lovable/Bolt
   ↓
5. Revisar contra checklist:
   ✓ Stack respeitado?
   ✓ Tokens Ventus aplicados?
   ✓ shadcn/ui usado?
   ✓ Estados loading/error/empty?
   ✓ Mobile-first se aplicável?
   ✓ a11y básico?
   ↓
6. Commit no branch da feature
   ↓
7. Documentar no Storybook (se houver)
```

---

## 13. Componentes específicos a criar

Lista de componentes que provavelmente shadcn não tem prontos e precisam ser criados:

| Componente | Onde usado |
|---|---|
| `<CountdownTimer />` | Página da turma (D-X) |
| `<PhotoGrid />` | Galeria do aluno |
| `<PhotoFullscreen />` | Detalhe de foto (swipe + ações) |
| `<CreditCounter />` | Indicador "X/Y selecionadas" |
| `<QRScanner />` | Tela de check-in operador |
| `<InstallmentTable />` | Tabela de parcelas |
| `<RsvpButtons />` | Página de convite (Confirmo/Não posso) |
| `<EventTimeline />` | Funil de produção admin |
| `<WhatsAppPreview />` | Preview de mensagem antes de disparar |

---

## 14. Não fazer (anti-patterns)

❌ Não criar telas com mais de 1 CTA principal por viewport
❌ Não usar cores fora do design system (proibido `#FF00FF` etc.)
❌ Não usar `useEffect` para fetch de dados (usar TanStack Query)
❌ Não usar `localStorage` direto (usar Zustand persist se precisar)
❌ Não criar mais de 1 nível de aninhamento de modais
❌ Não usar emoji em telas de admin/relatório
❌ Não usar mais de 3 fontes diferentes
❌ Não inventar componentes quando shadcn tem equivalente
❌ Não traduzir texto técnico de UI ("dashboard" pode ficar; "spinner" não)
