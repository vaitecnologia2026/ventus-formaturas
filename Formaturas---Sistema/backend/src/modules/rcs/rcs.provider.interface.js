/**
 * Contrato que todo provider RCS deve implementar.
 *
 * Não é uma classe abstrata — é JS, então confiamos em duck-typing.
 * Mas todo provider exporta uma classe com estes 4 métodos.
 *
 * Importante:
 *   - Sem credencial → throw RcsProviderError(code: 'credentials_missing')
 *   - Sem retornar { ok: true } quando o envio realmente falhou
 *   - Resposta bruta SEMPRE acessível via `result.raw` para auditoria
 */

export class RcsProviderError extends Error {
  /**
   * @param {string} code   — short error code: credentials_missing | invalid_phone | http_error | provider_rejected | timeout | webhook_signature_invalid
   * @param {string} message
   * @param {object} [detail] — extra info (status, body, etc)
   * @param {boolean} [retryable=true]
   */
  constructor(code, message, detail = undefined, retryable = true) {
    super(message);
    this.code = code;
    this.detail = detail;
    this.retryable = retryable;
  }
}

/**
 * Interface de referência. Não é importada — só serve como documentação.
 */
// eslint-disable-next-line no-unused-vars
class _RcsProviderInterface {
  /**
   * Sanity-check: credenciais válidas? Faz uma chamada barata pro provider.
   * @param {RcsProviderConfig} config
   * @returns {Promise<{ok: true, detail?: object}>}
   * @throws {RcsProviderError}
   */
  // eslint-disable-next-line no-unused-vars
  async testConnection(config) { throw new Error('not_implemented'); }

  /**
   * Envia uma mensagem.
   * @param {RcsProviderConfig} config
   * @param {SendMessageInput} input
   *   { toNormalized, messageType, text?, payload?, senderId?, agentId?, vars? }
   * @returns {Promise<{providerMessageId: string|null, providerStatus: string|null, raw: object, requestSent: object, durationMs: number, httpStatus: number}>}
   * @throws {RcsProviderError}
   */
  // eslint-disable-next-line no-unused-vars
  async sendMessage(config, input) { throw new Error('not_implemented'); }

  /**
   * Parseia um webhook recebido. Pode emitir múltiplos eventos.
   * @param {RcsProviderConfig} config
   * @param {object} headers — headers HTTP raw
   * @param {string|object} body — body raw (string para HMAC, ou parseado se já JSON)
   * @returns {Promise<{events: NormalizedWebhookEvent[]}>}
   *   NormalizedWebhookEvent = { providerMessageId, eventType, raw }
   * @throws {RcsProviderError}
   */
  // eslint-disable-next-line no-unused-vars
  async parseWebhook(config, headers, body) { throw new Error('not_implemented'); }

  /**
   * Verifica HMAC/assinatura do webhook.
   * @returns {boolean}
   */
  // eslint-disable-next-line no-unused-vars
  verifyWebhookSignature(config, headers, rawBody) { return false; }
}
