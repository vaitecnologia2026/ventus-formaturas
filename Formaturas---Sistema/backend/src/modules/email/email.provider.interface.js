/**
 * Contrato dos providers de e-mail.
 *
 * Mesma filosofia do RcsProvider:
 *   - Sem credencial → throw EmailProviderError(code: 'credentials_missing')
 *   - Sem sucesso falso
 *   - Resposta bruta sempre acessível em result.raw
 */
export class EmailProviderError extends Error {
  constructor(code, message, detail = undefined, retryable = true) {
    super(message);
    this.code = code;
    this.detail = detail;
    this.retryable = retryable;
  }
}

/**
 * Métodos esperados em cada provider:
 *
 *   testConnection(config)
 *     → { ok: true, detail?: object }
 *     throw EmailProviderError
 *
 *   sendEmail(config, input)
 *     input: { to, fromName, fromEmail, replyTo, subject, htmlBody, textBody, attachments?, headers? }
 *     → { providerMessageId, providerStatus, raw, requestSent, durationMs, httpStatus? }
 *     throw EmailProviderError
 *
 *   parseWebhook(config, headers, body)
 *     → { events: [{ providerMessageId, recipientEmail, eventType, raw }] }
 *
 *   verifyWebhookSignature(config, headers, rawBody)
 *     → boolean
 */
