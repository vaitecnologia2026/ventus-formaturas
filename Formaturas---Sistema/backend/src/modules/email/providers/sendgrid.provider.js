import sgMail from '@sendgrid/mail';
import crypto from 'crypto';
import { EmailProviderError } from '../email.provider.interface.js';

/**
 * SendGrid via SDK oficial @sendgrid/mail.
 *
 * Webhook events são assinados via Ed25519 (Event Webhook Verification).
 * Header de assinatura: X-Twilio-Email-Event-Webhook-Signature + X-Twilio-Email-Event-Webhook-Timestamp
 *
 * Referência: https://docs.sendgrid.com/for-developers/tracking-events/getting-started-event-webhook-security-features
 */
export class SendGridEmailProvider {
  _assertCredentials(config) {
    const missing = [];
    if (!config.apiKey) missing.push('api_key');
    if (!config.fromEmail) missing.push('from_email');
    if (missing.length) {
      throw new EmailProviderError('credentials_missing', `SendGrid requer: ${missing.join(', ')}`, { missing }, false);
    }
  }

  async testConnection(config) {
    this._assertCredentials(config);
    // Não há um endpoint "ping" oficial — fazemos GET /v3/scopes (o equivalente a "quem sou eu")
    try {
      const res = await fetch('https://api.sendgrid.com/v3/scopes', {
        method: 'GET',
        headers: { authorization: `Bearer ${config.apiKey}` },
      });
      if (!res.ok) {
        const body = await res.text();
        throw new EmailProviderError(
          res.status === 401 ? 'auth_error' : 'connection_failed',
          `SendGrid HTTP ${res.status}`,
          { body: body.slice(0, 500) },
          false,
        );
      }
      const data = await res.json();
      return { ok: true, detail: { scopes: data.scopes?.slice(0, 5) } };
    } catch (err) {
      if (err instanceof EmailProviderError) throw err;
      throw new EmailProviderError('connection_failed', err.message);
    }
  }

  async sendEmail(config, input) {
    this._assertCredentials(config);
    sgMail.setApiKey(config.apiKey);
    const startedAt = Date.now();
    const message = {
      to: input.to,
      from: input.fromName ? { name: input.fromName, email: input.fromEmail } : input.fromEmail,
      replyTo: input.replyTo || undefined,
      subject: input.subject,
      html: input.htmlBody || undefined,
      text: input.textBody || undefined,
      attachments: this._mapAttachments(input.attachments),
      headers: input.headers,
    };
    try {
      const [response] = await sgMail.send(message);
      const durationMs = Date.now() - startedAt;
      return {
        providerMessageId: response.headers?.['x-message-id'] || null,
        providerStatus: response.statusCode >= 200 && response.statusCode < 300 ? 'accepted' : 'unknown',
        raw: { statusCode: response.statusCode, headers: response.headers },
        requestSent: { to: input.to, subject: input.subject, attachments: input.attachments?.length || 0 },
        durationMs,
        httpStatus: response.statusCode,
      };
    } catch (err) {
      const code = err.code === 401 ? 'auth_error'
        : err.code === 400 ? 'provider_rejected'
        : 'http_error';
      throw new EmailProviderError(
        code,
        err.message,
        { code: err.code, response: err.response?.body },
        code !== 'auth_error',
      );
    }
  }

  async parseWebhook(_config, _headers, body) {
    // SendGrid envia array de eventos
    const parsed = typeof body === 'string' ? this._safeJson(body) : body;
    if (!Array.isArray(parsed)) return { events: [] };
    const events = parsed.map(ev => ({
      providerMessageId: ev.sg_message_id || ev['smtp-id'] || null,
      recipientEmail: ev.email || null,
      eventType: this._mapEvent(ev.event),
      raw: ev,
    }));
    return { events };
  }

  verifyWebhookSignature(config, headers, rawBody) {
    if (!config.webhookSecret) return true; // dev mode
    const sig = headers['x-twilio-email-event-webhook-signature'];
    const ts = headers['x-twilio-email-event-webhook-timestamp'];
    if (!sig || !ts) return false;
    // SendGrid usa Ed25519 com chave pública. webhookSecret aqui é a public key Ed25519 em base64.
    try {
      const publicKey = crypto.createPublicKey({
        key: Buffer.from(config.webhookSecret, 'base64'),
        format: 'der',
        type: 'spki',
      });
      const payload = ts + (typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody));
      return crypto.verify(null, Buffer.from(payload, 'utf8'), publicKey, Buffer.from(sig, 'base64'));
    } catch {
      return false;
    }
  }

  _mapEvent(ev) {
    switch (String(ev || '').toLowerCase()) {
      case 'delivered':                     return 'delivered';
      case 'open':                          return 'opened';
      case 'click':                         return 'clicked';
      case 'bounce':
      case 'blocked':
      case 'dropped':                       return 'bounced';
      case 'spamreport':                    return 'complained';
      case 'unsubscribe':
      case 'group_unsubscribe':             return 'unsubscribed';
      case 'deferred':
      case 'processed':                     return 'unknown';
      default:                              return 'unknown';
    }
  }

  _mapAttachments(att) {
    if (!Array.isArray(att) || !att.length) return undefined;
    return att.map(a => ({
      filename: a.filename,
      content: a.contentBase64 || (a.content ? Buffer.from(a.content).toString('base64') : ''),
      type: a.contentType,
      disposition: 'attachment',
    }));
  }

  _safeJson(s) { try { return JSON.parse(s); } catch { return null; } }
}
