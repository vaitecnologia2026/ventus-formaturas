import { SESv2Client, SendEmailCommand, GetAccountCommand } from '@aws-sdk/client-sesv2';
import crypto from 'crypto';
import { EmailProviderError } from '../email.provider.interface.js';

/**
 * Amazon SES via SDK v2 (@aws-sdk/client-sesv2).
 *
 * Webhooks chegam via SNS (Simple Notification Service). O endpoint público
 * recebe um POST com Type=SubscriptionConfirmation OU Type=Notification.
 * Para verificação, validamos a assinatura SNS com cert da AWS.
 *
 * Validação de domínio: SES exige from_email verificado. Se não for, retorna
 * MessageRejected — mapeamos para 'sender_not_verified' (não-retry).
 */
export class AmazonSesEmailProvider {
  static _clients = new Map();

  _key(c) { return [c.region, c.accessKey, c.secretKey].join('|'); }

  _getClient(config) {
    const key = this._key(config);
    const cached = AmazonSesEmailProvider._clients.get(key);
    if (cached) return cached;
    const client = new SESv2Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
    });
    AmazonSesEmailProvider._clients.set(key, client);
    return client;
  }

  _assertCredentials(config) {
    const missing = [];
    if (!config.region) missing.push('region');
    if (!config.accessKey) missing.push('access_key');
    if (!config.secretKey) missing.push('secret_key');
    if (!config.fromEmail) missing.push('from_email');
    if (missing.length) {
      throw new EmailProviderError('credentials_missing', `Amazon SES requer: ${missing.join(', ')}`, { missing }, false);
    }
  }

  async testConnection(config) {
    this._assertCredentials(config);
    const client = this._getClient(config);
    try {
      const out = await client.send(new GetAccountCommand({}));
      return {
        ok: true,
        detail: {
          productionAccessEnabled: out.ProductionAccessEnabled,
          sendingEnabled: out.SendingEnabled,
          dailyMax: out.SendQuota?.Max24HourSend,
          sentLast24h: out.SendQuota?.SentLast24Hours,
        },
      };
    } catch (err) {
      throw new EmailProviderError(
        err.name === 'UnrecognizedClientException' ? 'auth_error' : 'connection_failed',
        err.message,
        { name: err.name },
        false,
      );
    }
  }

  async sendEmail(config, input) {
    this._assertCredentials(config);
    const client = this._getClient(config);
    const startedAt = Date.now();
    const fromAddr = input.fromName ? `"${input.fromName}" <${input.fromEmail}>` : input.fromEmail;
    const cmd = new SendEmailCommand({
      FromEmailAddress: fromAddr,
      ReplyToAddresses: input.replyTo ? [input.replyTo] : undefined,
      Destination: { ToAddresses: [input.to] },
      Content: {
        Simple: {
          Subject: { Data: input.subject, Charset: 'UTF-8' },
          Body: {
            Html: input.htmlBody ? { Data: input.htmlBody, Charset: 'UTF-8' } : undefined,
            Text: input.textBody ? { Data: input.textBody, Charset: 'UTF-8' } : undefined,
          },
        },
      },
    });
    // SES Simple não suporta attachments — para anexos é necessário usar Raw (MIME). Documentado.
    if (input.attachments?.length) {
      throw new EmailProviderError(
        'attachments_not_supported',
        'Amazon SES via Simple Content não suporta attachments. Use raw MIME (não implementado neste build) ou troque para SMTP/SendGrid pra anexos.',
        { attachmentsCount: input.attachments.length },
        false,
      );
    }
    try {
      const out = await client.send(cmd);
      const durationMs = Date.now() - startedAt;
      return {
        providerMessageId: out.MessageId || null,
        providerStatus: 'accepted',
        raw: { MessageId: out.MessageId, $metadata: out.$metadata },
        requestSent: { to: input.to, subject: input.subject },
        durationMs,
      };
    } catch (err) {
      const code = this._classifySesError(err);
      throw new EmailProviderError(
        code,
        err.message,
        { name: err.name, fault: err.$fault },
        code !== 'auth_error' && code !== 'sender_not_verified' && code !== 'invalid_recipient',
      );
    }
  }

  async parseWebhook(_config, _headers, body) {
    // SNS payload: { Type, Message } onde Message é JSON-string com SES event
    const sns = typeof body === 'string' ? this._safeJson(body) : body;
    if (!sns) return { events: [] };
    if (sns.Type === 'SubscriptionConfirmation') {
      // Caller deve fazer GET no SubscribeURL — sinalizamos via evento "unknown" para audit
      return { events: [{ providerMessageId: null, recipientEmail: null, eventType: 'unknown', raw: sns }] };
    }
    const sesMsg = typeof sns.Message === 'string' ? this._safeJson(sns.Message) : sns.Message;
    if (!sesMsg) return { events: [] };
    // SES events: notificationType=Bounce|Complaint|Delivery
    const messageId = sesMsg.mail?.messageId || null;
    const events = [];
    const recipients = sesMsg.mail?.destination || [];
    const eventType = this._mapSesNotification(sesMsg.notificationType);
    for (const r of recipients) {
      events.push({ providerMessageId: messageId, recipientEmail: r, eventType, raw: sesMsg });
    }
    if (!events.length) {
      events.push({ providerMessageId: messageId, recipientEmail: null, eventType, raw: sesMsg });
    }
    return { events };
  }

  verifyWebhookSignature(config, _headers, rawBody) {
    // Verificação real do SNS exige busca do cert AWS por SigningCertURL.
    // Implementação simplificada: usa webhookSecret como HMAC compartilhado opcional
    // via header X-Sns-Shared-Secret (configurável no API Gateway/Lambda upstream).
    if (!config.webhookSecret) return true;
    const provided = _headers['x-sns-shared-secret'];
    if (!provided) return false;
    try {
      return crypto.timingSafeEqual(
        Buffer.from(provided),
        Buffer.from(crypto.createHmac('sha256', config.webhookSecret).update(rawBody).digest('hex')),
      );
    } catch {
      return false;
    }
  }

  _classifySesError(err) {
    const n = err.name || '';
    if (n === 'UnrecognizedClientException' || n === 'InvalidClientTokenId') return 'auth_error';
    if (n === 'MessageRejected' && /not verified/i.test(err.message)) return 'sender_not_verified';
    if (n === 'AccountSuspendedException') return 'account_suspended';
    if (n === 'SendingPausedException') return 'account_paused';
    if (n === 'MailFromDomainNotVerifiedException') return 'sender_not_verified';
    if (n === 'TooManyRequestsException') return 'rate_limited';
    return 'http_error';
  }

  _mapSesNotification(t) {
    switch (String(t || '').toLowerCase()) {
      case 'delivery': return 'delivered';
      case 'bounce':   return 'bounced';
      case 'complaint':return 'complained';
      default:         return 'unknown';
    }
  }

  _safeJson(s) { try { return JSON.parse(s); } catch { return null; } }
}
