# Google Ads Tracking — Contrato dos Endpoints

Base path: `/api/google-ads` · Autenticação: `Authorization: Bearer <jwt>` · Erros: `{ error: <code>, message?, detail? }`.

## 1. `GET /api/google-ads/status`

Visão consolidada para o dashboard. **Não exige credenciais configuradas** — só indica `credentialsConfigured: false` se faltar.

**200**
```json
{
  "credentialsConfigured": true,
  "uploadMode": "offline_click_conversion",
  "counts": {
    "pending": 0, "retrying": 0, "sent": 142, "failed": 3,
    "missing_required_data": 1, "ignored": 0
  },
  "successRate": 0.973,
  "lastSent":  { "at": "2026-05-02T13:42:11Z", "event": "sale_completed" },
  "lastError": { "at": "2026-05-02T11:08:00Z", "event": "lead_created", "message": "INVALID_CONVERSION_VALUE" }
}
```

## 2. `POST /api/google-ads/config`

Cria/atualiza credenciais (singleton). Validação Zod estrita.

**Body**
```json
{
  "customerId": "1234567890",
  "loginCustomerId": "9876543210",
  "developerToken": "...",
  "clientId": "...",
  "clientSecret": "...",
  "refreshToken": "...",
  "conversionActionId": "555000111",
  "conversionActionName": "Lead Site",
  "defaultCurrency": "BRL",
  "uploadMode": "offline_click_conversion",
  "eventActionMap": {
    "sale_completed": "555000222",
    "qualified_lead": "555000333"
  }
}
```

**200**
```json
{
  "ok": true,
  "credentials": {
    "customerId": "1234567890",
    "developerTokenSet": true,
    "clientSecretSet": true,
    "refreshTokenSet": true,
    "uploadMode": "offline_click_conversion",
    "...": "..."
  }
}
```
> Segredos **nunca** voltam em texto puro — apenas booleanos `*Set`.

## 3. `POST /api/google-ads/test-connection`

Executa um GAQL trivial (`SELECT customer.id, customer.descriptive_name FROM customer`). Sem body.

**200**
```json
{ "ok": true, "customerId": "1234567890", "descriptiveName": "Ventus Formaturas" }
```

**503** (sem credenciais configuradas)
```json
{
  "error": "google_ads_credentials_missing",
  "message": "Credenciais Google Ads ausentes: customerId, developerToken, ...",
  "detail": { "missing": ["customerId", "developerToken", "..."] }
}
```

**502** (credenciais existem mas a API rejeitou)
```json
{
  "error": "google_ads_connection_failed",
  "message": "Authentication of the request failed.",
  "detail": { "request_id": "abc...", "errors": [...] }
}
```

## 4. `POST /api/google-ads/upload-conversion`

Enfileira (UPSERT por `dedup_key`) e tenta enviar imediatamente. Se já foi enviada antes, retorna `deduplicated: true` sem reprocessar.

**Body**
```json
{
  "leadId": "lead-abc-123",
  "conversionEvent": "sale_completed",
  "conversionValue": 18400.00,
  "conversionCurrency": "BRL",
  "conversionTime": "2026-05-02T13:42:11Z",
  "gclid": "EAIaIQobCh...",
  "orderId": "OS-2026-0042"
}
```

**200** (enviada com sucesso)
```json
{
  "ok": true,
  "conversion": {
    "id": "uuid",
    "status": "sent",
    "attempts": 1,
    "sentAt": "2026-05-02T13:42:12Z",
    "dedupKey": "..."
  }
}
```

**200** (deduplicação)
```json
{ "ok": true, "deduplicated": true, "conversion": { "id": "uuid", "status": "sent", "..." : "..." } }
```

**202** (falhou, agendou retry)
```json
{
  "ok": false,
  "conversion": {
    "status": "failed",
    "attempts": 1,
    "lastError": "INVALID_CONVERSION_DATE_TIME",
    "nextRetryAt": "2026-05-02T13:47:12Z"
  }
}
```

**503** sem credenciais.

## 5. `POST /api/google-ads/retry-failed`

Reprocessa todas as conversões `failed` com `next_retry_at <= now()` e `attempts < 5`.

**200**
```json
{
  "rescheduled": 3,
  "processed": 3,
  "results": [
    { "id": "uuid-1", "status": "sent" },
    { "id": "uuid-2", "status": "failed" },
    { "id": "uuid-3", "status": "sent" }
  ],
  "maxAttempts": 5
}
```

> O worker `npm run worker` faz isso automaticamente a cada 60s. O endpoint serve para forçar manualmente do dashboard.

## 6. `GET /api/google-ads/conversions`

Lista paginada de conversões.

**Query**: `status=failed&conversionEvent=sale_completed&page=1&pageSize=50`

**200**
```json
{
  "page": 1, "pageSize": 50, "total": 198,
  "items": [
    { "id": "uuid", "leadId": "lead-1", "conversionEvent": "sale_completed", "status": "sent", "...": "..." }
  ]
}
```

## 7. `GET /api/google-ads/logs`

Audit trail. Cada tentativa de envio gera uma linha aqui — request bruto, resposta bruta, erro bruto.

**Query**: `conversionId=<uuid>&page=1&pageSize=50`

**200**
```json
{
  "page": 1, "pageSize": 50, "total": 5,
  "items": [
    {
      "id": "uuid",
      "conversionId": "uuid",
      "attempt": 1,
      "status": "failed",
      "rawRequest": { "conversion_action": "customers/.../conversionActions/...", "...": "..." },
      "rawResponse": { "errors": [{ "error_code": { "conversion_upload_error": "INVALID_CONVERSION_DATE_TIME" }, "message": "..." }] },
      "errorCode": "INVALID_CONVERSION_DATE_TIME",
      "durationMs": 412,
      "createdAt": "2026-05-02T13:42:12Z"
    }
  ]
}
```

---

## Endpoints auxiliares de tracking (públicos)

### `POST /api/tracking/capture`

Chamado no landing/SPA navigation. Captura GCLID/GBRAID/WBRAID/UTM/ValueTrack do query/body.

**Body** (todos opcionais — vem do query string normalmente):
```json
{ "sessionToken": "(opcional - cria se não vier)" }
```

Combina query string com body. Devolve o `sessionToken` para o front guardar em cookie/localStorage.

### `POST /api/tracking/attach-lead`

Vincula um leadId à sessão e enriquece com PII (email/phone/nome) para uso futuro em Enhanced Conversions.

```json
{
  "leadId": "lead-abc-123",
  "sessionToken": "uuid-da-sessao",
  "profile": {
    "email": "fulano@gmail.com",
    "phone": "+5538999991234",
    "firstName": "Fulano",
    "lastName": "Silva"
  }
}
```

---

## Códigos de erro padronizados

| Código HTTP | `error` | Causa |
|---|---|---|
| 400 | `validation_error` | Zod rejeitou o payload (`issues` traz detalhes) |
| 400 | `conversion_action_not_configured` | Evento sem `conversion_action_id` mapeado |
| 401 | `missing_or_invalid_authorization_header` | Sem `Bearer` |
| 401 | `invalid_token` | JWT inválido/expirado |
| 404 | `not_found` | Rota não existe |
| 404 | `conversion_not_found` | UUID não encontrado |
| 429 | (rate limit do express-rate-limit) | >240 req/min/IP |
| 501 | `upload_mode_not_implemented` | `data_manager_api` ainda no roadmap do Google |
| 502 | `google_ads_connection_failed` | Credenciais OK mas Google rejeitou |
| 503 | `google_ads_credentials_missing` | Faltam variáveis essenciais — **nunca devolvemos sucesso falso** |
