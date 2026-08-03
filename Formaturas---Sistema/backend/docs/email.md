# E-mail — Módulo Multi-Provider

Envio de e-mail com 4 providers nativos, templates com variáveis e anexos, lista de supressão, retry e webhook.

Base path: `/api/email` · Auth: JWT em todas as rotas exceto `/webhook/:providerId` (público).

## Providers

| `providerType` | Stack | Notas |
|---|---|---|
| `smtp`         | `nodemailer` | Gmail / Outlook / SMTP profissional / servidor próprio. Suporta anexos. |
| `sendgrid`     | `@sendgrid/mail` | Webhook assinado Ed25519 (Twilio Email Event Webhook). |
| `amazon_ses`   | `@aws-sdk/client-sesv2` | Anexos via Raw MIME ainda **não** implementados (limitação documentada). Webhooks via SNS. |
| `generic_http` | fetch + template + jsonpath | Qualquer API HTTP (Mailgun, Postmark, Resend, etc.). |

> **Adicionar novo provider:** crie `src/modules/email/providers/<nome>.provider.js`, registre em `providers/registry.js`, adicione ao enum `EmailProviderType` no `schema.prisma`. Sem mudanças em service/controller/routes.

## Variáveis de ambiente
**Nenhuma nova obrigatória.** Credenciais ficam no banco via `POST /api/email/providers`.

Reutiliza `DATABASE_URL`, `JWT_SECRET`, `PORT`, `PGBOSS_SCHEMA`. As 4 SDKs (`nodemailer`, `@sendgrid/mail`, `@aws-sdk/client-sesv2`) carregam credenciais do banco a cada call — nada de `process.env.SENDGRID_API_KEY` global.

## 1. Cadastrar SMTP (ex: Gmail / SMTP corporativo)

```bash
curl -X POST http://localhost:4000/api/email/providers \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "providerName": "Gmail Corporativo",
    "providerType": "smtp",
    "fromName": "Ventus Formaturas",
    "fromEmail": "no-reply@ventusformaturas.com.br",
    "replyTo": "contato@ventusformaturas.com.br",
    "host": "smtp.gmail.com",
    "port": 587,
    "secure": false,
    "username": "no-reply@ventusformaturas.com.br",
    "password": "<app-password-do-gmail>",
    "dailyLimit": 2000,
    "hourlyLimit": 250
  }'
```

Para Outlook / Office 365: `host: smtp.office365.com`, `port: 587`, `secure: false`. Para SMTP próprio com SSL direto: `port: 465`, `secure: true`.

## 2. Cadastrar SendGrid

```bash
curl -X POST http://localhost:4000/api/email/providers \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "providerName": "SendGrid Prod",
    "providerType": "sendgrid",
    "fromName": "Ventus",
    "fromEmail": "noreply@ventus.com",
    "apiKey": "SG.xxxxxxxxxxxxxxxxxxx",
    "webhookSecret": "<base64 da public key Ed25519 do Event Webhook>",
    "dailyLimit": 100000
  }'
```

`webhookSecret` é a **public key Ed25519** que o SendGrid mostra em Settings → Mail Settings → Event Webhook → Signed Event Webhook → "Verification Key" (formato base64). Sem ela, todos os webhooks são aceitos (modo dev).

## 3. Cadastrar Amazon SES

```bash
curl -X POST http://localhost:4000/api/email/providers \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "providerName": "AWS SES Prod",
    "providerType": "amazon_ses",
    "fromName": "Ventus",
    "fromEmail": "verified-sender@ventus.com",
    "region": "sa-east-1",
    "accessKey": "AKIAIOSFODNN7EXAMPLE",
    "secretKey": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    "dailyLimit": 50000
  }'
```

**Atenção:**
- `fromEmail` (ou o domínio dele) **precisa estar verificado** no painel SES da AWS, senão `MessageRejected`.
- Conta nova SES fica em **sandbox** — só envia para emails verificados. Pedir produção no painel AWS.
- IAM user precisa ter pelo menos `ses:SendEmail` + `ses:GetAccount` no policy.
- **Anexos não suportados** neste build (SES Simple Content). Para anexar arquivos, use SMTP ou SendGrid.

## 4. Cadastrar Generic HTTP (Resend, Mailgun, Postmark, etc.)

```bash
curl -X POST http://localhost:4000/api/email/providers \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "providerName": "Resend",
    "providerType": "generic_http",
    "fromName": "Ventus",
    "fromEmail": "noreply@ventus.com",
    "baseUrl": "https://api.resend.com",
    "sendPath": "/emails",
    "authType": "bearer_token",
    "bearerToken": "re_xxxxxxxxxxxxxxxx",
    "payloadTemplate": {
      "from": "{{from_email}}",
      "to": ["{{to}}"],
      "subject": "{{subject}}",
      "html": "{{html}}",
      "text": "{{text}}"
    },
    "responsePaths": { "messageId": "id", "status": "id", "error": "message" }
  }'
```

## 5. Testar conexão

```bash
curl -X POST http://localhost:4000/api/email/test-connection \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{ "providerId": "<uuid>" }'
```

- **200 OK** → credenciais válidas (SMTP: `verify()`, SendGrid: `GET /v3/scopes`, SES: `GetAccount`, Generic: HEAD na baseUrl).
- **503 credentials_missing** → faltam campos obrigatórios.
- **502** → credenciais existem mas provider rejeitou.

## 6. Enviar e-mail teste (real)

### Texto + HTML simples

```bash
curl -X POST http://localhost:4000/api/email/send \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "providerId": "<uuid>",
    "to": "destinatario@email.com",
    "subject": "Sua proposta está pronta — {{nome}}",
    "html": "<p>Olá {{nome}}!</p><p>Anexamos sua proposta em PDF.</p>",
    "text": "Olá {{nome}}! Anexamos sua proposta em PDF.",
    "variables": { "nome": "Camila" },
    "metadata": { "campaignId": "proposta-q1", "leadId": "lead-789" }
  }'
```

### Com anexo (PDF base64)

```bash
curl -X POST http://localhost:4000/api/email/send \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "providerId": "<uuid>",
    "to": "destinatario@email.com",
    "subject": "Boleto disponível",
    "html": "<p>Segue o boleto da parcela 03/18.</p>",
    "attachments": [
      {
        "filename": "boleto-03.pdf",
        "contentType": "application/pdf",
        "contentBase64": "JVBERi0xLjQK..."
      }
    ]
  }'
```

### Resposta padronizada (sempre o mesmo shape — usado pelo Motor de Campanha futuro)

```json
{ "success": true, "messageId": "msg_abc", "status": "sent" }
{ "success": false, "messageId": null, "status": "rejected", "error": "suppressed", "message": "Email em supressão (bounce)" }
{ "success": false, "messageId": null, "status": "failed", "error": "credentials_missing", "message": "..." }
```

## 7. Templates — criar e usar

### Criar template com variáveis declaradas e anexo padrão

```bash
curl -X POST http://localhost:4000/api/email/templates \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "boleto_mensal",
    "category": "financeiro",
    "subject": "Boleto da parcela {{numero}}/{{total}} — {{nome}}",
    "htmlBody": "<p>Olá {{nome}},</p><p>Segue boleto da parcela {{numero}} de {{total}}, vencimento em {{vencimento}}, no valor de R$ {{valor}}.</p>",
    "textBody": "Olá {{nome}}, segue boleto da parcela {{numero}}/{{total}}, vence em {{vencimento}}, R$ {{valor}}.",
    "preview": "Boleto disponível para pagamento",
    "allowedVariables": ["nome", "numero", "total", "vencimento", "valor"],
    "attachments": [
      { "filename": "instrucoes-pagamento.pdf", "contentType": "application/pdf", "url": "https://cdn.ventus.com/instrucoes.pdf" }
    ],
    "active": true
  }'
```

`allowedVariables` é a lista das variáveis **obrigatórias** — se faltar alguma no envio, o request retorna `template_missing_vars`.

### Enviar usando o template

```bash
curl -X POST http://localhost:4000/api/email/send-template \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "providerId": "<uuid-provider>",
    "templateId": "<uuid-template>",
    "to": "camila@email.com",
    "variables": {
      "nome": "Camila",
      "numero": "3",
      "total": "18",
      "vencimento": "10/05/2026",
      "valor": "1.022,21"
    },
    "metadata": { "campaignId": "cobranca-mensal", "leadId": "lead-456" }
  }'
```

O service renderiza subject + htmlBody + textBody com as variables, herda os anexos do template (a menos que você passe `attachments` no request — esses sobrescrevem), e dispara.

### Atualizar / desativar template

```bash
PUT  /api/email/templates/<uuid>     # update parcial
DELETE /api/email/templates/<uuid>
```

## 8. Webhook (recebe eventos do provider)

Endpoint **público**: `POST /api/email/webhook/:providerId`

Configure essa URL no painel do provider (SendGrid: Event Webhook; SES: SNS Topic; Generic: HMAC).

**O que acontece:**
1. Provider extrai eventos do payload (`delivered`/`opened`/`clicked`/`bounced`/`complained`/`unsubscribed`).
2. Para cada evento:
   - Persiste em `email_webhook_events` com `signature_valid` indicando se HMAC bate.
   - Se válido → atualiza `status` da `email_message` correspondente.
   - Se for `bounced`/`complained`/`unsubscribed` → adiciona email à `email_suppressions` (próximos envios pra esse email retornam `rejected`).
3. Sem assinatura válida → `401` mas evento gravado pra audit.

## 9. Limites diários e horários

Configure `dailyLimit` e/ou `hourlyLimit` no provider. O service conta as últimas 24h (ou 1h) e bloqueia novos envios com `429 daily_limit_reached` / `429 hourly_limit_reached`. Útil para:
- Gmail: 500/dia (gratuito), 2000/dia (Workspace)
- SES sandbox: 200/dia
- SendGrid free: 100/dia

## 10. Lista de supressão

Auto-população via webhook (bounce/complaint/unsub). Adição manual via service (não exposta como endpoint público — pode ser feita via `prisma.emailSuppression.create()`).

Comportamento: qualquer `sendEmail()` com `to` em supressão retorna `{ success:false, status:'rejected', error:'suppressed' }` **sem chamar o provider**.

## 11. Listagens e auditoria

```bash
GET /api/email/messages?status=bounced&campaignId=cobranca&page=1&pageSize=50
GET /api/email/messages/<uuid>
GET /api/email/logs?messageId=<uuid>            # toda tentativa = 1 log com rawRequest/rawResponse
GET /api/email/status                           # dashboard: counts + rates (open/click/bounce/success) + lastSent + lastError
GET /api/email/templates                         # lista templates
```

## 12. Retry

Idêntico ao Google Ads/RCS:
- Janelas: 5min → 30min → 2h → 6h → 24h
- Máx 5 tentativas
- **Não retry**: `credentials_missing`, `auth_error`, `invalid_recipient`, `sender_not_verified`, `template_missing_vars`, `attachments_not_supported`, `suppressed`, `invalid_email`
- Worker: `npm run worker` (mesma instância que processa Google Ads + RCS)

## 13. Função interna para o Motor de Campanha

```js
import { sendEmail } from './modules/email/email.service.js';

const result = await sendEmail({
  providerId: '<uuid>',
  to: 'lead@email.com',
  subject: '...',         // ignorado se templateId
  html: '...',
  text: '...',
  templateId: '<uuid>',   // opcional
  variables: { nome: '...', valor: '...' },
  attachments: [/* opcional, sobrescreve template */],
  campaignId: '...',
  leadId: '...',
  userId: '...',          // sub do JWT, para auditoria
});
// result: { success, messageId, status, error?, message?, deduplicated? }
```

Quando construirmos o **Motor de Campanha**, ele vai chamar `sendEmail()` direto — sem HTTP, sem JWT, mesma garantia de dedup/retry/log/supressão.

## 14. Códigos de erro

| HTTP | `error` | Causa |
|---|---|---|
| 400 | `validation_error` | Zod rejeitou o payload (email, falta html/text/template, etc.) |
| 400 | `invalid_email` | Email não passa no validator RFC |
| 400 | `template_missing_vars` | Variáveis obrigatórias do template ausentes |
| 400 | `attachments_not_supported` | SES Simple Content não suporta anexos |
| 401 | `webhook_signature_invalid` | HMAC/Ed25519 do webhook não bate |
| 404 | `email_provider_not_found` / `email_template_not_found` / `email_message_not_found` | UUID inexistente |
| 409 | `email_provider_inactive` / `template_inactive` | Recurso desativado |
| 429 | `daily_limit_reached` / `hourly_limit_reached` | Limites do provider |
| 502 | `auth_error` / `sender_not_verified` / `provider_rejected` | Provider rejeitou |
| 503 | `credentials_missing` | Faltam campos obrigatórios — **nunca devolvemos 200 falso** |

E nas respostas do `sendEmail` (sucesso parcial / rejeição lógica):
- `status: 'rejected'` + `error: 'suppressed'` → email em supressão
- `status: 'rejected'` + `error: 'invalid_email'` → email malformado
- `status: 'failed'` + `error: 'credentials_missing'` → tentativa real, falhou na pré-checagem

## 15. Limitações conhecidas

- **SES + anexos**: não suportado neste build (precisaria implementar SES Raw MIME). Use SMTP/SendGrid pra anexos com SES.
- **Credenciais em texto puro no banco** (mesmo padrão Google Ads/RCS) — produção exige criptografia KMS.
- **Verificação SNS real (AWS) não implementada**: usa HMAC compartilhado opcional via header `X-Sns-Shared-Secret`. Para validação completa, a Lambda upstream do API Gateway deve já verificar a assinatura SNS antes de POSTar aqui.
- **OAuth2 client_credentials no GenericHttp**: cache não está implementado (cada request faz novo token request). Para alto volume, adicionar cache.
- **Frontend não integrado**: os botões "E-mail" em Configurações ainda são mockados. Wiring é próxima iteração.
- **Single-tenant**: sem `tenantId` ainda.

## 16. Próximo módulo

**Telefonia** — webhook de chamadas (Twilio/Asaas/Z-API voice) que vincula `LeadAttribution` para conversões `phone_call` no Google Ads. Mesmo padrão (provider abstraction + webhook + supressão de blacklists DNC).
