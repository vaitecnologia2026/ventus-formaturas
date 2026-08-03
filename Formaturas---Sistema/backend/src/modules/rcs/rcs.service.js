import crypto from 'crypto';
import { prisma } from '../../db/prisma.js';
import { logger } from '../../config/logger.js';
import { AppError } from '../../middleware/error.js';
import { normalizePhone } from '../../utils/phone.js';
import { getProvider } from './providers/registry.js';
import { RcsProviderError } from './rcs.provider.interface.js';
import { writeMessageLog } from './rcs.logs.js';

export const MAX_RCS_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 6 * 60 * 60_000, 24 * 60 * 60_000];

// Códigos que NUNCA devem fazer retry
const NON_RETRYABLE_CODES = new Set(['credentials_missing', 'auth_error', 'invalid_phone', 'template_missing_vars']);

// ---------------- Provider CRUD ----------------

export async function listProviders() {
  return prisma.rcsProvider.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function getProviderRecord(id) {
  const p = await prisma.rcsProvider.findUnique({ where: { id } });
  if (!p) throw new AppError('rcs_provider_not_found', `Provider ${id} não encontrado`, 404);
  return p;
}

export async function createProvider(data) {
  return prisma.rcsProvider.create({ data });
}

export async function updateProvider(id, data) {
  await getProviderRecord(id); // garante existência
  return prisma.rcsProvider.update({ where: { id }, data });
}

export async function deleteProvider(id) {
  await getProviderRecord(id);
  return prisma.rcsProvider.delete({ where: { id } });
}

// ---------------- Test connection ----------------

export async function testConnection(id) {
  const cfg = await getProviderRecord(id);
  const impl = getProvider(cfg.providerKind);
  try {
    return await impl.testConnection(cfg);
  } catch (err) {
    if (err instanceof RcsProviderError) {
      throw new AppError(err.code, err.message, mapErrorStatus(err.code), err.detail);
    }
    throw err;
  }
}

// ---------------- Send ----------------

export async function sendMessage(input, { userId } = {}) {
  const cfg = await getProviderRecord(input.providerId);
  if (!cfg.active) throw new AppError('rcs_provider_inactive', `Provider ${cfg.providerName} está desativado`, 409);

  // Normaliza telefone
  const phone = normalizePhone(input.to, isoFromCountryCode(cfg.defaultCountryCode));
  if (!phone.ok) {
    throw new AppError('invalid_phone', `Telefone inválido: ${phone.error}`, 400, { original: phone.original });
  }

  const dedupKey = buildDedupKey({
    providerId: cfg.id,
    leadId: input.metadata?.leadId,
    campaignId: input.metadata?.campaignId,
    text: input.text,
    payload: input.payload,
    to: phone.normalized,
  });

  // UPSERT — dedup por dedupKey unique
  const message = await prisma.rcsMessage.upsert({
    where: { dedupKey },
    create: {
      providerId: cfg.id,
      templateId: input.templateId ?? null,
      toOriginal: phone.original,
      toNormalized: phone.normalized,
      messageType: input.messageType,
      text: input.text ?? null,
      payload: input.payload ?? null,
      campaignId: input.metadata?.campaignId ?? null,
      leadId: input.metadata?.leadId ?? null,
      triggeredByUserId: userId ?? null,
      dedupKey,
    },
    update: {}, // dedup: nada muda
  });

  if (message.status === 'sent' || message.status === 'delivered' || message.status === 'read') {
    return { deduplicated: true, message };
  }

  return processMessage(message.id, { vars: input.vars });
}

/**
 * Envia (ou re-envia) uma mensagem já existente. Worker chama isso no retry.
 */
export async function processMessage(messageId, { vars } = {}) {
  const m = await prisma.rcsMessage.findUnique({
    where: { id: messageId },
    include: { provider: true, template: true },
  });
  if (!m) throw new AppError('rcs_message_not_found', `Mensagem ${messageId} não encontrada`, 404);
  if (m.status === 'sent') return m;

  const cfg = m.provider;
  const impl = getProvider(cfg.providerKind);

  const attempt = m.attempts + 1;
  await prisma.rcsMessage.update({ where: { id: m.id }, data: { status: 'queued', attempts: attempt } });

  const sendInput = {
    toOriginal: m.toOriginal,
    toNormalized: m.toNormalized,
    messageType: m.messageType,
    text: m.text,
    payload: m.payload,
    vars: vars || {},
  };

  let outcome = 'sent';
  let providerMessageId = null;
  let providerStatus = null;
  let raw = null;
  let requestSent = null;
  let durationMs = null;
  let httpStatus = null;
  let errorMessage = null;
  let errorCode = null;

  try {
    const result = await impl.sendMessage(cfg, sendInput);
    providerMessageId = result.providerMessageId;
    providerStatus = result.providerStatus;
    raw = result.raw;
    requestSent = result.requestSent;
    durationMs = result.durationMs;
    httpStatus = result.httpStatus;
  } catch (err) {
    if (err instanceof RcsProviderError) {
      outcome = err.code === 'invalid_phone' ? 'rejected' : 'failed';
      errorMessage = err.message;
      errorCode = err.code;
      raw = err.detail?.raw ?? err.detail ?? null;
      requestSent = err.detail?.requestSent ?? null;
      httpStatus = err.detail?.httpStatus ?? null;
      // não-retryable se o code está na blocklist OU o error marcou retryable=false
      if (NON_RETRYABLE_CODES.has(err.code) || err.retryable === false) {
        // marca como failed mas sem nextRetryAt
        outcome = err.code === 'credentials_missing' ? 'failed' : outcome;
      }
    } else {
      outcome = 'failed';
      errorMessage = err.message;
      errorCode = 'internal_error';
      logger.error({ err, messageId }, 'rcs_send_internal_error');
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const data = {
      status: outcome,
      providerMessageId,
      lastError: errorMessage,
    };
    if (outcome === 'sent') {
      data.sentAt = new Date();
      data.nextRetryAt = null;
    } else if (outcome === 'failed') {
      const nonRetryable = NON_RETRYABLE_CODES.has(errorCode) || attempt >= MAX_RCS_ATTEMPTS;
      data.nextRetryAt = nonRetryable ? null : computeNextRetry(attempt);
      if (attempt >= MAX_RCS_ATTEMPTS) data.failedAt = new Date();
    } else if (outcome === 'rejected') {
      data.nextRetryAt = null;
      data.failedAt = new Date();
    }
    const next = await tx.rcsMessage.update({ where: { id: m.id }, data });
    await tx.rcsMessageLog.create({
      data: {
        messageId: m.id,
        attempt,
        status: outcome,
        providerName: cfg.providerName,
        rawRequest: requestSent,
        rawResponse: raw,
        httpStatus,
        errorMessage,
        errorCode,
        durationMs,
      },
    });
    return next;
  });

  return updated;
}

// ---------------- Webhook ----------------

export async function handleWebhook({ providerId, headers, rawBody }) {
  const cfg = await getProviderRecord(providerId);
  const impl = getProvider(cfg.providerKind);
  const signatureValid = impl.verifyWebhookSignature(cfg, headers, rawBody);

  // Sempre persiste o evento bruto, mesmo se a assinatura for inválida (audit trail)
  let parsed;
  try {
    parsed = await impl.parseWebhook(cfg, headers, rawBody);
  } catch (err) {
    parsed = { events: [{ providerMessageId: null, eventType: 'unknown', raw: { parse_error: err.message } }] };
  }

  const persisted = [];
  for (const ev of parsed.events) {
    const message = ev.providerMessageId
      ? await prisma.rcsMessage.findFirst({ where: { providerId, providerMessageId: ev.providerMessageId } })
      : null;

    const persistedEv = await prisma.rcsWebhookEvent.create({
      data: {
        providerId,
        messageId: message?.id ?? null,
        eventType: ev.eventType,
        providerMessageId: ev.providerMessageId,
        rawHeaders: serializeHeaders(headers),
        rawBody: typeof rawBody === 'string' ? safeJson(rawBody) ?? { raw: rawBody.slice(0, 4000) } : rawBody,
        signatureValid,
        processed: signatureValid,
        processingError: signatureValid ? null : 'webhook_signature_invalid',
      },
    });
    persisted.push(persistedEv);

    // Atualiza o status da mensagem APENAS se assinatura for válida
    if (signatureValid && message) {
      await applyWebhookToMessage(message, ev);
    }
  }

  return { signatureValid, eventsCount: persisted.length };
}

async function applyWebhookToMessage(message, ev) {
  const data = {};
  switch (ev.eventType) {
    case 'delivered':  data.status = 'delivered'; data.deliveredAt = new Date(); break;
    case 'read':       data.status = 'read';      data.readAt = new Date();      break;
    case 'failed':
    case 'rejected':   data.status = ev.eventType; data.failedAt = new Date();   break;
    default: return; // clicked/replied/unknown não mexem no status principal
  }
  await prisma.rcsMessage.update({ where: { id: message.id }, data });
}

// ---------------- Status (dashboard) ----------------

export async function getStatus() {
  const [providersTotal, providersActive, totalSent, totalDelivered, totalRead, totalFailed, lastError, lastSent] = await Promise.all([
    prisma.rcsProvider.count(),
    prisma.rcsProvider.count({ where: { active: true } }),
    prisma.rcsMessage.count({ where: { status: { in: ['sent', 'delivered', 'read'] } } }),
    prisma.rcsMessage.count({ where: { status: { in: ['delivered', 'read'] } } }),
    prisma.rcsMessage.count({ where: { status: 'read' } }),
    prisma.rcsMessage.count({ where: { status: { in: ['failed', 'rejected'] } } }),
    prisma.rcsMessage.findFirst({ where: { lastError: { not: null } }, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true, lastError: true } }),
    prisma.rcsMessage.findFirst({ where: { sentAt: { not: null } }, orderBy: { sentAt: 'desc' }, select: { sentAt: true, providerId: true } }),
  ]);
  const totalAttempted = totalSent + totalFailed;
  const deliveryRate   = totalSent > 0 ? totalDelivered / totalSent : null;
  const successRate    = totalAttempted > 0 ? totalSent / totalAttempted : null;
  return {
    providers: { total: providersTotal, active: providersActive },
    counts: { sent: totalSent, delivered: totalDelivered, read: totalRead, failed: totalFailed },
    deliveryRate,
    successRate,
    lastSent,
    lastError,
  };
}

// ---------------- Internal helpers ----------------

function buildDedupKey({ providerId, leadId, campaignId, text, payload, to }) {
  const hash = crypto.createHash('sha256');
  hash.update(providerId);
  hash.update('|');
  hash.update(to || '');
  hash.update('|');
  hash.update(leadId || '');
  hash.update('|');
  hash.update(campaignId || '');
  hash.update('|');
  hash.update(text || '');
  hash.update('|');
  hash.update(payload ? JSON.stringify(payload) : '');
  return hash.digest('hex');
}

function computeNextRetry(attempt) {
  if (attempt >= MAX_RCS_ATTEMPTS) return null;
  const delay = RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
  return new Date(Date.now() + delay);
}

function isoFromCountryCode(cc) {
  // Mapeamento mínimo. Para cobertura ampla, usar `country-data` ou similar.
  const map = { '1': 'US', '44': 'GB', '55': 'BR', '52': 'MX', '54': 'AR', '56': 'CL', '57': 'CO', '351': 'PT' };
  return map[String(cc)] || 'BR';
}

function mapErrorStatus(code) {
  if (code === 'credentials_missing') return 503;
  if (code === 'invalid_phone' || code === 'template_missing_vars') return 400;
  if (code === 'auth_error') return 502;
  if (code === 'http_error') return 502;
  return 500;
}

function serializeHeaders(h) {
  const out = {};
  if (!h) return out;
  for (const [k, v] of Object.entries(h)) {
    if (typeof v === 'string') out[k.toLowerCase()] = v;
  }
  return out;
}
function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }
