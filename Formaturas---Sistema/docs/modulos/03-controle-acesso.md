# Módulo 3 — Controle de Acesso (QR + Pulseira Impressa)

## 3.1 Objetivo

Eliminar fila e fricção na entrada do evento: convidado chega, mostra QR no celular, operador escaneia, **pulseira com nome impressa em <3 segundos**.

## 3.2 Funcionalidades

### F3.1 — Geração de QR único por convidado
- Cada convidado tem `qrToken` único (UUID v4 + HMAC para evitar forja)
- QR Code embutido no convite WhatsApp
- Token é válido apenas para o evento específico
- Token é "queimado" após uso (single-use por padrão; configurável para reentrada)

### F3.2 — App de check-in (web responsivo, modo tablet/quiosque)
- Operador abre URL com login específico do evento
- Tela permanece em modo "câmera ativa" + botão grande de check-in manual
- Câmera detecta QR → valida instantaneamente
- Tela mostra: foto do convidado (se tem), nome em destaque, status, botão "IMPRIMIR PULSEIRA"

### F3.3 — Validação do QR
- Sistema valida em tempo real:
  - Token existe e é válido?
  - É deste evento?
  - Já foi usado? (alerta: "Este QR já foi usado às 19:32")
  - RSVP estava confirmado? (warning, mas permite passagem)
- Resposta em <500ms

### F3.4 — Impressão automática de pulseira
- Após validar, sistema envia job para print server local (USB)
- ZPL gerado com:
  - **Nome do convidado** em fonte grande
  - **QR Code menor** (caso precise reentrada)
  - **Cor de fundo por categoria**: VIP (dourado), comum (azul Ventus), comissão (vermelho)
  - **Logo Ventus + nome do evento**
- Pulseira impressa em ~2-3 segundos (Zebra ZD510-HC com Z-Band)

### F3.5 — Modo offline (resiliente)
- Print server local cacheia tabela de convidados antes do evento (download diário)
- Se internet cair durante o evento:
  - Tablet salva check-in localmente
  - Print server imprime mesmo sem internet (dados já cacheados)
  - Quando internet volta, sincroniza com a API

### F3.6 — Check-in manual (fallback)
- Convidado sem celular: operador busca por nome ou CPF
- Sistema confere se está na lista
- Mesmo fluxo de impressão

### F3.7 — Múltiplos pontos de entrada
- Vários tablets podem operar simultaneamente
- Sincronização em tempo real (via Redis pub/sub)
- Dashboard central mostra fluxo de entrada por ponto

### F3.8 — Painel de portaria (admin)
- Tempo real:
  - Quantos chegaram / total esperado
  - Taxa de chegada por minuto (gráfico)
  - Lista dos próximos esperados (top 20 que ainda não chegaram)
- Alertas: pessoas tentando entrar sem QR válido

### F3.9 — Categorização de convidados
- Tipos: **Convidado comum**, **VIP**, **Comissão**, **Imprensa**, **Funcionário**
- Cada categoria com cor/badge diferente na pulseira
- Áreas restritas: pulseira VIP libera acesso a espaços exclusivos (info na pulseira)

### F3.10 — Após o evento
- Relatório completo:
  - Convidados que confirmaram mas não compareceram
  - Convidados que apareceram sem RSVP (incluídos manualmente)
  - Tempo médio de check-in
  - Picos de chegada
- Exportação CSV para análise

## 3.3 Telas

### Operador de portaria (tablet, modo quiosque)

| Tela | Descrição |
|---|---|
| **Login** | Auth simples por código de evento + PIN do operador |
| **Câmera ativa (home)** | Câmera grande + tip "Aponte para o QR" + botão "Buscar manual" |
| **Validação OK** | Foto + nome grande em verde + "Imprimindo pulseira..." |
| **Validação ERRO** | "QR já usado" / "QR inválido" / "RSVP não confirmado" + botão "Permitir mesmo assim" (com motivo) |
| **Busca manual** | Campo de busca + lista (foto, nome, status) |
| **Resumo de turno** | Quantos checkins, tempo médio, alertas |

### Admin (web)

| Tela | Descrição |
|---|---|
| **Painel ao vivo** | Gráfico de chegada + lista de pendentes + pontos de entrada |
| **Configurar evento** | Categorias, cores, layout de pulseira, pontos de operação |
| **Relatório pós-evento** | Estatísticas + exportação |

## 3.4 Regras de negócio

- **Reentrada:** padrão = single-use. Configurável para "permitir saída e retorno" (relevante em eventos longos)
- **Convidado sem RSVP:** pode entrar com aprovação do operador (registra motivo)
- **Acompanhante extra:** não permitido sem cadastro prévio
- **Menores:** se evento permite, podem entrar com pulseira "MENOR" (sem cota)
- **Reimpressão:** permitida 1x mediante senha do operador (perda de pulseira)

## 3.5 Hardware

### Impressora: **Zebra ZD510-HC**
- Direct thermal, 300 dpi
- Cartucho Z-Band antimicrobiano
- Conectividade: USB + Ethernet + WiFi
- Velocidade: ~3 segundos por pulseira
- Custo: ~R$ 4.500-7.500 (aquisição) ou ~R$ 200/dia (aluguel)

### Tablet/computador na portaria
- Tablet Android 10" ou notebook básico
- Câmera frontal/traseira para QR
- Mini-PC opcional rodando print server (Raspberry Pi 4 funciona)

### Pulseira
- Z-Band Direct (rolo de 200 unidades)
- Pulseira branca, impressão preta
- Tamanho adulto e infantil

## 3.6 Integrações

- **Print Server local (Node.js):** rodando no PC da portaria
  - Recebe jobs via WebSocket da API
  - Comando ZPL via USB para Zebra
  - Cache offline em SQLite local
- **Zebra ZPL (Zebra Programming Language):** texto enviado pra impressora
  - Comando para QR: `^BQN,2,5^FDQA,{token}^FS`
  - Comando para texto grande: `^A0N,80,80^FDNome do Convidado^FS`

## 3.7 Critérios de aceite

- [ ] Check-in (QR scan + validação) em <3 segundos
- [ ] Impressão de pulseira em <3 segundos após validação
- [ ] Suporta 4+ pontos de entrada simultâneos
- [ ] Modo offline funciona sem perda de dados
- [ ] Sincronização pós-offline em <10s
- [ ] Tela do operador é à prova de falhas (não trava com QR ruim)
- [ ] Pulseira fica legível após 8h de uso (suor, água)

## 3.8 Métricas

- Tempo médio de check-in (meta: <5s)
- Taxa de impressão sem erro (meta: >99%)
- Taxa de QRs inválidos / total de tentativas
- Picos de chegada (informa dimensionamento de pontos)
- Satisfação do operador (NPS interno pós-evento)
