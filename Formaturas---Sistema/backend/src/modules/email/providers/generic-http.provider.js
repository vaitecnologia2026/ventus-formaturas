import crypto from 'crypto';
import { EmailProviderError } from '../email.provider.interface.js';
import { renderTemplate } from '../../../utils/template.js';
import { getByPath } from '../../../utils/jsonpath.js';

/**
 * Provider HTTP genérico para qualquer API de e-mail (Mailgun, Postmark, Resend, etc).
 *
 * Configure no painel:
 *   - baseUrl + sendPath + httpMethod
 *   - authType + credenciais (api_key_header / bearer_token / basic_auth / oauth2)
 *   - payloadTemplate com {{to}}, {{from_email}}, {{subject}}, {{html}}, {{text}}, {{from_name}}, {{reply_to}}
 *   - responsePaths { messageId, status, error }
 */
export class GenericHttpEmailProvider {
  defaultPayloadTemplate(_c) {
    return {
      to: '{{to}}',
      from: '{{from_email}}',
      subject: '{{subject}}',
      html: '{{html}}',
      text: '{{text}}',
    };
  }
  defaultResponsePaths() {
    return { messageId: 'id', status: 'status', error: 'error' };
  }

  _assertCredentials(config) {
    const missing = [];
    if (!config.baseUrl) missing.push('base_url');
    if (!config.fromEmail) missing.push('from_email');
    switch (config.authType) {
      case 'api_key_header':
      case 'api_key_query':           if (!config.apiKey) missing.push('api_key'); break;
      case 'bearer_token':            if (!config.bearerToken) missing.push('bearer_token'); break;
      case 'basic_auth':              if (!config.username) missing.push('username'); if (!config.password) missing.push('password'); break;
      case 'oauth2_client_credentials': /* TODO: oauth2 cache se precisar */ break;
      case 'custom_headers':          if (!config.customHeaders) missing.push('custom_headers'); break;
      case 'none':                    break;
      default:                        missing.push('auth_type');
    }
    if (missing.length) {
      throw new EmailProviderError('credentials_missing', `Generic HTTP requer: ${missing.join(', ')}`, { missing }, false);
    }
  }

  async testConnection(config) {
    this._assertCredentials(config);
    try {
      const headers = this._buildAuthHeaders(config);
      const res = await this._fetchWithTimeout(config.baseUrl, { method: 'HEAD', headers }, config.timeoutMs);
      return { ok: true, detail: { status: res.status, url: config.baseUrl } };
    } catch (err) {
      throw new EmailProviderError('connection_failed', err.message);
    }
  }

  async sendEmail(config, input) {
    this._assertCredentials(config);
    const url = this._buildSendUrl(config);
    const method = config.httpMethod || 'POST';
    const template = config.payloadTemplate ?? this.defaultPayloadTemplate(config);
    const vars = {
      to: input.to,
      from_email: input.fromEmail,
      from_name: input.fromName ?? '',
      reply_to: input.replyTo ?? '',
      subject: input.subject,
      html: input.htmlBody ?? '',
      text: input.textBody ?? '',
    };
    const { rendered: body, missing } = renderTemplate(template, vars);
    if (missing.length) {
      throw new EmailProviderError('template_missing_vars', `Variáveis ausentes no payload_template: ${missing.join(', ')}`, { missing }, false);
    }

    const headers = {
      'content-type': 'application/json',
      ...this._buildAuthHeaders(config),
      ...(config.customHeaders || {}),
    };

    const startedAt = Date.now();
    let res;
    let parsed;
    let rawText;
    try {
      res = await this._fetchWithTimeout(url, { method, headers, body: JSON.stringify(body) }, config.timeoutMs);
      rawText = await res.text();
      parsed = rawText ? this._safeJson(rawText) : null;
    } catch (err) {
      throw new EmailProviderError('http_error', `Falha de rede: ${err.message}`, { url });
    }
    const durationMs = Date.now() - startedAt;
    const paths = config.responsePaths ?? this.defaultResponsePaths();
    if (!res.ok) {
      const errMsg = (parsed && getByPath(parsed, paths.error)) || `HTTP ${res.status}`;
      throw new EmailProviderError(
        'provider_rejected',
        String(errMsg),
        { httpStatus: res.status, raw: parsed ?? rawText, requestSent: body },
        res.status >= 500,
      );
    }
    return {
      providerMessageId: parsed ? String(getByPath(parsed, paths.messageId) ?? '') || null : null,
      providerStatus:    parsed ? String(getByPath(parsed, paths.status) ?? '') || null : null,
      raw: parsed ?? rawText,
      requestSent: body,
      durationMs,
      httpStatus: res.status,
    };
  }

  async parseWebhook(_c, _h, body) {
    const parsed = typeof body === 'string' ? this._safeJson(body) : body;
    if (!parsed) return { events: [] };
    const list = Array.isArray(parsed.events) ? parsed.events : [parsed];
    return {
      events: list.map(ev => ({
        providerMessageId: ev.messageId || ev.id || null,
        recipientEmail: ev.to || ev.email || ev.recipient || null,
        eventType: this._mapEvent(ev.event || ev.type || ev.status),
        raw: ev,
      })),
    };
  }

  verifyWebhookSignature(config, headers, rawBody) {
    if (!config.webhookSecret) return true;
    const sig = headers['x-webhook-signature'];
    if (!sig) return false;
    const expected = 'sha256=' + crypto.createHmac('sha256', config.webhookSecret).update(rawBody).digest('hex');
    try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)); } catch { return false; }
  }

  _buildSendUrl(c) {
    const base = c.baseUrl.replace(/\/+$/, '');
    const path = (c.sendPath || '/send').replace(/^\/*/, '/');
    return base + path;
  }

  _buildAuthHeaders(c) {
    const h = {};
    switch (c.authType) {
      case 'api_key_header':  h['x-api-key'] = c.apiKey; break;
      case 'bearer_token':    h.authorization = `Bearer ${c.bearerToken}`; break;
      case 'basic_auth':      h.authorization = 'Basic ' + Buffer.from(`${c.username}:${c.password}`).toString('base64'); break;
      case 'custom_headers':  break;
      case 'none':            break;
      default:                break;
    }
    return h;
  }

  _mapEvent(ev) {
    const m = String(ev || '').toLowerCase();
    if (['delivered', 'delivery'].includes(m)) return 'delivered';
    if (['open', 'opened'].includes(m)) return 'opened';
    if (['click', 'clicked'].includes(m)) return 'clicked';
    if (['bounce', 'bounced', 'hardbounce'].includes(m)) return 'bounced';
    if (['complaint', 'complained', 'spam'].includes(m)) return 'complained';
    if (['unsubscribe', 'unsubscribed'].includes(m)) return 'unsubscribed';
    if (['failed', 'rejected', 'error'].includes(m)) return 'failed';
    return 'unknown';
  }

  _safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

  async _fetchWithTimeout(url, opts, timeoutMs = 15000) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try { return await fetch(url, { ...opts, signal: ctl.signal }); }
    finally { clearTimeout(t); }
  }
}
