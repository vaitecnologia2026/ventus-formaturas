import crypto from 'crypto';
import { RcsProviderError } from '../rcs.provider.interface.js';
import { renderTemplate } from '../../../utils/template.js';
import { getByPath } from '../../../utils/jsonpath.js';

/**
 * Provider RCS HTTP genérico — funciona com qualquer fornecedor que aceite POST JSON.
 *
 * Configuração no RcsProvider:
 *   - baseUrl + sendPath + httpMethod
 *   - authType + credenciais correspondentes
 *   - payloadTemplate: { ...JSON com {{to}}, {{message}}, {{sender_id}}, etc. }
 *   - responsePaths: { messageId: "data.id", status: "data.status", error: "errors.0.message" }
 *   - customHeaders: { "X-Account": "abc" }
 *   - timeoutMs
 *
 * Os 4 providers nomeados (Zenvia/Pontaltech/Infobip/TakeBlip) herdam daqui e
 * só sobrescrevem defaults pra payloadTemplate e responsePaths.
 */
export class GenericHttpRcsProvider {
  /** Defaults aplicados quando o config não traz template/paths próprios. */
  defaultPayloadTemplate(_config) {
    return { to: '{{to}}', message: '{{message}}', sender_id: '{{sender_id}}' };
  }
  defaultResponsePaths() {
    return { messageId: 'id', status: 'status', error: 'error' };
  }
  defaultSendPath() { return '/send'; }
  defaultHttpMethod() { return 'POST'; }

  // ----------------- Public API -----------------

  async testConnection(config) {
    this._assertCredentials(config);
    // O genérico não tem endpoint de health específico — fazemos um request HEAD na baseUrl.
    // Subclasses podem sobrescrever com endpoint próprio.
    const url = config.baseUrl;
    try {
      const headers = await this._buildAuthHeaders(config);
      const res = await this._fetchWithTimeout(url, { method: 'HEAD', headers }, config.timeoutMs);
      return { ok: true, detail: { status: res.status, url } };
    } catch (err) {
      if (err instanceof RcsProviderError) throw err;
      throw new RcsProviderError('http_error', `Falha no test-connection: ${err.message}`, { url });
    }
  }

  async sendMessage(config, input) {
    this._assertCredentials(config);
    const url = this._buildSendUrl(config);
    const method = config.httpMethod || this.defaultHttpMethod();
    const template = config.payloadTemplate ?? this.defaultPayloadTemplate(config);
    const vars = this._buildVars(config, input);
    const { rendered: body, missing } = renderTemplate(template, vars);
    if (missing.length) {
      throw new RcsProviderError(
        'template_missing_vars',
        `Variáveis faltando no payload_template: ${missing.join(', ')}`,
        { missing },
        false, // não retry — config errada
      );
    }

    let headers;
    try {
      headers = await this._buildAuthHeaders(config);
    } catch (err) {
      throw new RcsProviderError('auth_error', err.message, undefined, false);
    }
    headers['content-type'] = 'application/json';
    Object.assign(headers, config.customHeaders || {});

    const startedAt = Date.now();
    let res;
    let parsed;
    let rawText;
    try {
      res = await this._fetchWithTimeout(url, { method, headers, body: JSON.stringify(body) }, config.timeoutMs);
      rawText = await res.text();
      parsed = rawText ? this._safeJson(rawText) : null;
    } catch (err) {
      throw new RcsProviderError('http_error', `Falha de rede: ${err.message}`, { url, method });
    }
    const durationMs = Date.now() - startedAt;

    if (!res.ok) {
      const paths = config.responsePaths ?? this.defaultResponsePaths();
      const errMsg = (parsed && getByPath(parsed, paths.error)) || `HTTP ${res.status}`;
      throw new RcsProviderError(
        'provider_rejected',
        String(errMsg),
        { httpStatus: res.status, raw: parsed ?? rawText, requestSent: body },
        res.status >= 500, // 5xx retry, 4xx não
      );
    }

    const paths = config.responsePaths ?? this.defaultResponsePaths();
    const providerMessageId = parsed ? String(getByPath(parsed, paths.messageId) ?? '') || null : null;
    const providerStatus    = parsed ? String(getByPath(parsed, paths.status) ?? '') || null : null;

    return {
      providerMessageId,
      providerStatus,
      raw: parsed ?? rawText,
      requestSent: body,
      durationMs,
      httpStatus: res.status,
    };
  }

  async parseWebhook(_config, _headers, body) {
    // Genérico: assume formato { messageId, status } ou { messages: [{ id, status }] }
    const parsed = typeof body === 'string' ? this._safeJson(body) : body;
    if (!parsed) return { events: [] };
    const events = [];
    const list = Array.isArray(parsed?.messages) ? parsed.messages : [parsed];
    for (const m of list) {
      const providerMessageId = m.messageId || m.id || m.message_id || null;
      const status = String(m.status || m.event || 'unknown').toLowerCase();
      events.push({ providerMessageId, eventType: this._mapEventType(status), raw: m });
    }
    return { events };
  }

  verifyWebhookSignature(config, headers, rawBody) {
    if (!config.webhookSecret) return true; // sem secret → aceita tudo (insecure mode)
    // Convenção: cabeçalho `X-Webhook-Signature: sha256=<hex>` HMAC do body cru
    const sig = headers['x-webhook-signature'] || headers['X-Webhook-Signature'];
    if (!sig) return false;
    const expected = 'sha256=' + crypto.createHmac('sha256', config.webhookSecret).update(rawBody).digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  // ----------------- Helpers (protegidos — usados por subclasses) -----------------

  _assertCredentials(config) {
    const missing = this._missingCredentials(config);
    if (missing.length) {
      throw new RcsProviderError(
        'credentials_missing',
        `Credenciais ausentes para ${config.providerName} (${config.providerKind}): ${missing.join(', ')}`,
        { missing },
        false,
      );
    }
    if (!config.baseUrl) {
      throw new RcsProviderError('credentials_missing', 'base_url é obrigatório', { missing: ['base_url'] }, false);
    }
  }

  _missingCredentials(config) {
    switch (config.authType) {
      case 'none':           return [];
      case 'api_key_header': return config.apiKey ? [] : ['api_key'];
      case 'api_key_query':  return config.apiKey ? [] : ['api_key'];
      case 'bearer_token':   return config.bearerToken ? [] : ['bearer_token'];
      case 'basic_auth':     return [...(config.username ? [] : ['username']), ...(config.password ? [] : ['password'])];
      case 'oauth2_client_credentials': {
        const m = [];
        if (!config.clientId) m.push('client_id');
        if (!config.clientSecret) m.push('client_secret');
        if (!config.oauthTokenUrl) m.push('oauth_token_url');
        return m;
      }
      case 'custom_headers': return config.customHeaders ? [] : ['custom_headers'];
      default: return ['auth_type_invalid'];
    }
  }

  _buildSendUrl(config) {
    const base = config.baseUrl.replace(/\/+$/, '');
    const path = (config.sendPath || this.defaultSendPath()).replace(/^\/*/, '/');
    return base + path;
  }

  async _buildAuthHeaders(config) {
    const headers = {};
    switch (config.authType) {
      case 'none': break;
      case 'api_key_header':
        headers['x-api-key'] = config.apiKey;
        break;
      case 'api_key_query':
        // tratado em _buildSendUrl (subclasse pode sobrescrever); aqui não fazemos nada
        break;
      case 'bearer_token':
        headers['authorization'] = `Bearer ${config.bearerToken}`;
        break;
      case 'basic_auth':
        headers['authorization'] = 'Basic ' + Buffer.from(`${config.username}:${config.password}`).toString('base64');
        break;
      case 'oauth2_client_credentials': {
        const token = await this._getOauth2Token(config);
        headers['authorization'] = `Bearer ${token}`;
        break;
      }
      case 'custom_headers':
        // Headers extras já são mergeados em sendMessage via customHeaders
        break;
      default:
        throw new RcsProviderError('auth_error', `auth_type desconhecido: ${config.authType}`, undefined, false);
    }
    return headers;
  }

  // Cache OAuth2 em memória (key = clientId|tokenUrl). TTL respeita expires_in.
  static _oauthCache = new Map();
  async _getOauth2Token(config) {
    const key = `${config.clientId}|${config.oauthTokenUrl}`;
    const cached = GenericHttpRcsProvider._oauthCache.get(key);
    if (cached && cached.exp > Date.now() + 30_000) return cached.token;

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.clientId,
      client_secret: config.clientSecret,
    });
    if (config.oauthScope) params.set('scope', config.oauthScope);
    const res = await this._fetchWithTimeout(config.oauthTokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    }, config.timeoutMs);
    const text = await res.text();
    const data = this._safeJson(text);
    if (!res.ok || !data?.access_token) {
      throw new RcsProviderError('auth_error', `OAuth2 token request failed: HTTP ${res.status}`, { raw: data ?? text }, false);
    }
    const ttlMs = (Number(data.expires_in) || 3600) * 1000;
    GenericHttpRcsProvider._oauthCache.set(key, { token: data.access_token, exp: Date.now() + ttlMs });
    return data.access_token;
  }

  /** Variáveis disponíveis para o payload_template. Subclasses podem ampliar. */
  _buildVars(config, input) {
    return {
      to: input.toNormalized,
      to_original: input.toOriginal,
      message: input.text ?? '',
      message_type: input.messageType,
      sender_id: config.senderId ?? '',
      agent_id: config.agentId ?? '',
      account_id: config.accountId ?? '',
      ...(input.vars || {}),
    };
  }

  _mapEventType(s) {
    const m = String(s || '').toLowerCase();
    if (['delivered', 'delivery', 'delivered_to_handset'].includes(m)) return 'delivered';
    if (['read', 'opened'].includes(m)) return 'read';
    if (['failed', 'undeliverable', 'error'].includes(m)) return 'failed';
    if (['rejected', 'blocked'].includes(m)) return 'rejected';
    if (['clicked', 'click'].includes(m)) return 'clicked';
    if (['replied', 'reply', 'inbound'].includes(m)) return 'replied';
    return 'unknown';
  }

  _safeJson(text) {
    try { return JSON.parse(text); } catch { return null; }
  }

  async _fetchWithTimeout(url, opts, timeoutMs = 15000) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      return await fetch(url, { ...opts, signal: ctl.signal });
    } finally {
      clearTimeout(t);
    }
  }
}
