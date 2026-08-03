# RCS — Módulo Multi-Provider

Módulo de envio RCS (Rich Communication Services) com suporte a múltiplos fornecedores via interface unificada.

Base path: `/api/rcs` · Auth: JWT em todas as rotas exceto `/webhook/:providerId`.

## Providers suportados nativamente

| `providerKind` | Notas |
|---|---|
| `generic_http` | Qualquer fornecedor com API HTTP. Você define `payload_template` e `response_paths`. |
| `zenvia`       | Defaults pra POST `/v2/channels/rcs/messages` + header `X-API-Token`. |
| `pontaltech`   | Defaults pra POST `/v3/rcs/send` + bearer JWT. |
| `infobip`      | Defaults pra POST `/rcs/2/messages` + header `Authorization: App {key}`. |
| `takeblip`     | Defaults pra POST `/messages` + header `Authorization: Key {key}`. Gera message_id automaticamente. |

> **Para adicionar um novo provider:** crie `src/modules/rcs/providers/<nome>.provider.js` (extenda `GenericHttpRcsProvider`), registre no `providers/registry.js`, adicione o valor ao enum `RcsProviderKind` no `schema.prisma`. Sem mudanças em service/controller/routes.

## Variáveis de ambiente

Nada obrigatório novo — credenciais ficam **no banco**, configuradas via `POST /api/rcs/providers`. Reutiliza as mesmas vars do Google Ads (`DATABASE_URL`, `JWT_SECRET`, `PORT`, etc.).

## 1. Cadastrar um provider

### Generic HTTP (totalmente customizável)

```bash
curl -X POST http://localhost:4000/api/rcs/providers \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "providerName": "MeuRCS",
    "providerKind": "generic_http",
    "baseUrl": "https://api.meurcs.com.br",
    "sendPath": "/v1/messages",
    "httpMethod": "POST",
    "authType": "bearer_token",
    "bearerToken": "tok_abc123",
    "senderId": "Ventus",
    "webhookSecret": "shhh-super-secreto",
    "defaultCountryCode": "55",
    "rateLimitPerMinute": 60,
    "timeoutMs": 15000,
    "customHeaders": { "X-Account-Id": "ventus-mc" },
    "payloadTemplate": {
      "to": "{{to}}",
      "from": "{{sender_id}}",
      "type": "{{message_type}}",
      "content": { "text": "{{message}}" }
    },
    "responsePaths": {
      "messageId": "data.messageId",
      "status": "data.status",
      "error": "errors.0.message"
    }
  }'
```

### Zenvia

```bash
curl -X POST http://localhost:4000/api/rcs/providers \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "providerName": "Zenvia Prod",
    "providerKind": "zenvia",
    "baseUrl": "https://api.zenvia.com",
    "authType": "api_key_header",
    "apiKey": "ZENVIA_TOKEN",
    "senderId": "ventus_rcs"
  }'
```

`payloadTemplate`/`responsePaths` herdados do `ZenviaRcsProvider` — não precisa enviar.

### Infobip

```bash
curl -X POST http://localhost:4000/api/rcs/providers \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "providerName": "Infobip Prod",
    "providerKind": "infobip",
    "baseUrl": "https://xxx.api.infobip.com",
    "authType": "api_key_header",
    "apiKey": "INFOBIP_API_KEY",
    "senderId": "ventus"
  }'
```

## 2. Testar conexão

```bash
curl -X POST http://localhost:4000/api/rcs/test-connection \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{ "providerId": "<uuid>" }'
```

**200 OK** → credenciais válidas, fornecedor responde.
**503** → credenciais ausentes ou incompletas (lista o que falta em `detail.missing`).
**502** → credenciais existem mas fornecedor rejeitou.

## 3. Enviar mensagem (real)

### Texto simples

```bash
curl -X POST http://localhost:4000/api/rcs/send \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "providerId": "<uuid>",
    "to": "(38) 99876-5432",
    "messageType": "text",
    "text": "Olá, {{nome}}! Sua formatura está marcada pra 15/07.",
    "vars": { "nome": "Camila" },
    "metadata": { "campaignId": "d7-cobranca", "leadId": "lead-abc-123" }
  }'
```

O `to` pode vir bagunçado — o backend normaliza via libphonenumber para E.164 (`+5538998765432`). Salvamos o `original` e o `normalized` no banco.

### Rich card / carousel / template

Use `payload` no body com a estrutura nativa do provider:

```json
{
  "providerId": "<uuid>",
  "to": "+5538998765432",
  "messageType": "rich_card",
  "payload": {
    "title": "Confirme presença",
    "description": "Sua formatura é dia 15/07",
    "media": { "url": "https://cdn.ventus/conv.jpg" },
    "suggestions": [
      { "reply": { "text": "Confirmo", "postback": "yes" } },
      { "reply": { "text": "Não vou",  "postback": "no" } }
    ]
  },
  "metadata": { "campaignId": "rsvp-d3", "leadId": "lead-456" }
}
```

### Resposta

**200**:
```json
{
  "ok": true,
  "message": {
    "id": "uuid",
    "status": "sent",
    "providerMessageId": "ZNV-xyz",
    "toNormalized": "+5538998765432",
    "attempts": 1,
    "sentAt": "2026-05-02T13:42:11Z",
    "lastError": null
  }
}
```

**200 dedup** (mesma campanha+lead+texto+telefone no mesmo dedup window):
```json
{ "ok": true, "deduplicated": true, "message": { "...": "..." } }
```

**202** (falhou, agendou retry):
```json
{
  "ok": false,
  "message": {
    "status": "failed",
    "attempts": 1,
    "lastError": "INVALID_DESTINATION",
    "nextRetryAt": "2026-05-02T13:47:11Z"
  }
}
```

**400 telefone inválido**:
```json
{ "error": "invalid_phone", "message": "Telefone inválido: phone_invalid_for_country", "detail": { "original": "abc" } }
```

**503 sem credenciais** → estruturado, **nunca 200 fake**.

## 4. Webhook (recebe eventos do provider)

Endpoint **público**: `POST /api/rcs/webhook/:providerId`

O provider configura essa URL no painel dele. Quando uma mensagem é entregue/lida/rejeitada, ele faz POST aqui.

**HMAC validation**: header `X-Webhook-Signature: sha256=<hex>` calculado com `webhookSecret` configurado no provider.

```
HMAC-SHA256(webhookSecret, raw_body) = signature_esperada
```

**Comportamento:**
- Sem `webhookSecret` configurado → aceita tudo (modo inseguro, só pra dev)
- Signature válida → atualiza `rcsMessage.status` (`delivered`/`read`/`failed`/...)
- Signature inválida → grava em `rcs_webhook_events` com `signature_valid=false` (audit) e responde **401**

**Eventos normalizados** (qualquer provider):
- `delivered` (entregue ao handset)
- `read` (lida pelo destinatário)
- `failed` (erro permanente)
- `rejected` (operadora bloqueou)
- `clicked` (clicou em botão da rich card)
- `replied` (respondeu)
- `unknown` (não mapeável)

## 5. Listagem e auditoria

```bash
# Listar campanhas (paginado, filtrável)
GET /api/rcs/messages?status=failed&campaignId=d7-cobranca&page=1&pageSize=50

# Detalhe de uma mensagem (inclui provider básico)
GET /api/rcs/messages/<uuid>

# Logs técnicos (toda tentativa de envio gera 1 linha aqui — rawRequest, rawResponse, errorMessage)
GET /api/rcs/logs?messageId=<uuid>

# Status agregado (dashboard)
GET /api/rcs/status
# → { providers: {total, active}, counts: {sent, delivered, read, failed},
#     deliveryRate, successRate, lastSent, lastError }
```

## 6. Retry

Configurado idêntico ao Google Ads:
- Janelas: 5min → 30min → 2h → 6h → 24h
- Máximo 5 tentativas
- **Não retry para**: `credentials_missing`, `auth_error`, `invalid_phone`, `template_missing_vars`
- Worker: `npm run worker` (mesma instância que processa Google Ads)

## 7. Auth types do GenericHttp

| `authType` | Campos exigidos | Como vai no request |
|---|---|---|
| `none` | — | Sem header de auth |
| `api_key_header` | `apiKey` | `X-API-Key: <apiKey>` (subclasses podem mudar — Zenvia usa `X-API-Token`, Infobip usa `Authorization: App ...`) |
| `api_key_query` | `apiKey` | (subclasse define como concat na URL) |
| `bearer_token` | `bearerToken` | `Authorization: Bearer <token>` |
| `basic_auth` | `username`, `password` | `Authorization: Basic <base64(user:pass)>` |
| `oauth2_client_credentials` | `clientId`, `clientSecret`, `oauthTokenUrl`, opcional `oauthScope` | Faz POST no token endpoint (`grant_type=client_credentials`), cacheia por `expires_in`, manda `Authorization: Bearer <accessToken>` |
| `custom_headers` | `customHeaders` | Apenas merge dos headers extras configurados |

## 8. Variáveis disponíveis no `payload_template`

Todas substituídas via `{{var}}`:

| Variável | Origem |
|---|---|
| `{{to}}` | Telefone normalizado E.164 |
| `{{to_original}}` | Telefone como veio do request |
| `{{message}}` | `text` do payload |
| `{{message_type}}` | `text`, `rich_card`, etc. |
| `{{sender_id}}` | Configurado no provider |
| `{{agent_id}}` | Configurado no provider |
| `{{account_id}}` | Configurado no provider |
| `{{<qualquer>}}` | Qualquer chave que vier em `vars` no body do `/send` |

Suporte também a `{{user.name}}` (paths aninhados).

## 9. Códigos de erro padronizados

| HTTP | `error` | Causa |
|---|---|---|
| 400 | `validation_error` | Zod rejeitou o payload |
| 400 | `invalid_phone` | Telefone falhou na normalização (libphonenumber) |
| 400 | `template_missing_vars` | `payload_template` referencia `{{x}}` não fornecido |
| 401 | `webhook_signature_invalid` | HMAC do webhook não bate |
| 404 | `rcs_provider_not_found` / `rcs_message_not_found` / `rcs_template_not_found` | UUID inexistente |
| 409 | `rcs_provider_inactive` | Provider está com `active=false` |
| 502 | `provider_rejected` / `http_error` | Fornecedor respondeu erro |
| 503 | `credentials_missing` | Faltam campos obrigatórios — **nunca devolvemos 200 falso** |

## 10. Limitações conhecidas

- **Credenciais em texto puro no banco** (assim como Google Ads). Para produção: criptografar com KMS antes de persistir, decryptar só na hora do envio.
- **`data_manager_api`** ainda não implementado (placeholder no Google Ads, não se aplica aqui).
- **Templates RCS não são sincronizados com o provider** — você cadastra a definição no nosso banco, mas não criamos automaticamente no painel do provider. Quem aprova é o painel deles.
- **Signature schemes diferentes**: Zenvia/Infobip/Pontaltech/Take usam HMAC com headers próprios — o `verifyWebhookSignature` padrão usa `X-Webhook-Signature`. Para os 4 nomeados, sobrescreva no provider class quando integrar de verdade (placeholder atual = HMAC genérico).
- **Multi-tenant**: tudo single-tenant. Multi-tenant exigirá `tenantId` em RcsProvider e demais.
- **Frontend não integrado**: a tela de configurações do protótipo HTML ainda é mockada. Próxima iteração liga os botões a esses endpoints.

## 11. Próximo módulo

**Módulo 3 — E-mail.** Mesmo padrão (provider abstraction + retry + dedup), com providers Resend, SES, SMTP, Mailgun. Bounce handling via webhook.
