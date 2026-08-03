import nodemailer from 'nodemailer';
import { EmailProviderError } from '../email.provider.interface.js';

/**
 * SMTP via Nodemailer — funciona com Gmail / Outlook / SMTP profissional / servidor próprio.
 *
 * Cache de transports por config (idempotência). Invalidado se host/port/user/pass mudar.
 */
export class SmtpEmailProvider {
  static _transports = new Map();

  _key(c) { return [c.host, c.port, c.username, c.password].join('|'); }

  _getTransport(config) {
    const key = this._key(config);
    const cached = SmtpEmailProvider._transports.get(key);
    if (cached) return cached;
    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure ?? (config.port === 465),
      auth: (config.username || config.password)
        ? { user: config.username, pass: config.password }
        : undefined,
      connectionTimeout: config.timeoutMs,
      greetingTimeout: config.timeoutMs,
      socketTimeout: config.timeoutMs,
    });
    SmtpEmailProvider._transports.set(key, transport);
    return transport;
  }

  _assertCredentials(config) {
    const missing = [];
    if (!config.host) missing.push('host');
    if (!config.port) missing.push('port');
    if (!config.fromEmail) missing.push('from_email');
    if (missing.length) {
      throw new EmailProviderError(
        'credentials_missing',
        `SMTP requer: ${missing.join(', ')}`,
        { missing },
        false,
      );
    }
  }

  async testConnection(config) {
    this._assertCredentials(config);
    const t = this._getTransport(config);
    try {
      await t.verify();
      return { ok: true, detail: { host: config.host, port: config.port } };
    } catch (err) {
      throw new EmailProviderError('connection_failed', err.message, { host: config.host });
    }
  }

  async sendEmail(config, input) {
    this._assertCredentials(config);
    const t = this._getTransport(config);
    const startedAt = Date.now();
    const message = {
      from: input.fromName ? `"${input.fromName}" <${input.fromEmail}>` : input.fromEmail,
      to: input.to,
      replyTo: input.replyTo || undefined,
      subject: input.subject,
      html: input.htmlBody || undefined,
      text: input.textBody || undefined,
      attachments: this._mapAttachments(input.attachments),
      headers: input.headers,
    };
    try {
      const info = await t.sendMail(message);
      const durationMs = Date.now() - startedAt;
      return {
        providerMessageId: info.messageId || null,
        providerStatus: info.accepted?.length ? 'accepted' : 'unknown',
        raw: { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected, response: info.response },
        requestSent: { to: input.to, subject: input.subject, hasHtml: !!input.htmlBody, hasText: !!input.textBody, attachments: input.attachments?.length || 0 },
        durationMs,
      };
    } catch (err) {
      const code = this._classifyNodemailerError(err);
      throw new EmailProviderError(
        code,
        err.message,
        { code: err.code, response: err.response, responseCode: err.responseCode },
        code !== 'auth_error' && code !== 'invalid_recipient',
      );
    }
  }

  // SMTP puro não recebe webhooks — bounces vêm via NDR. Implementações futuras podem
  // configurar inbox parser; por ora, retornamos vazio e signatureValid=false.
  async parseWebhook(_config, _headers, _body) { return { events: [] }; }
  verifyWebhookSignature(_config, _headers, _rawBody) { return false; }

  _mapAttachments(att) {
    if (!Array.isArray(att) || !att.length) return undefined;
    return att.map(a => {
      if (a.url) return { filename: a.filename, path: a.url, contentType: a.contentType };
      if (a.contentBase64) return { filename: a.filename, content: Buffer.from(a.contentBase64, 'base64'), contentType: a.contentType };
      if (a.content) return { filename: a.filename, content: a.content, contentType: a.contentType };
      return null;
    }).filter(Boolean);
  }

  _classifyNodemailerError(err) {
    const c = String(err.code || '').toUpperCase();
    if (c === 'EAUTH' || /auth/i.test(err.message)) return 'auth_error';
    if (c === 'EENVELOPE' || /no recipient|invalid.*recipient/i.test(err.message)) return 'invalid_recipient';
    if (c === 'ETIMEDOUT' || c === 'ECONNECTION') return 'http_error';
    if (c === 'EMESSAGE') return 'provider_rejected';
    return 'http_error';
  }
}
