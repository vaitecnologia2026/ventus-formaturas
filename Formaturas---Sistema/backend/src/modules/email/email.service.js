import crypto from 'crypto';
import { prisma } from '../../db/prisma.js';
import { logger } from '../../config/logger.js';
import { AppError } from '../../middleware/error.js';
import { isValidEmail, normalizeEmail } from '../../utils/email-validator.js';
import { renderTemplate } from '../../utils/template.js';
import { getProvider } from './providers/registry.js';
import { EmailProviderError } from './email.provider.interface.js';

export const MAX_EMAIL_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 6 * 60 * 60_000, 24 * 60 * 60_000];

const NON_RETRYABLE_CODES = new Set([
  'credentials_missing', 'auth_error', 'invalid_recipient',
  'sender_not_verified', 'template_missing_vars', 'attachments_not_supported',
  'suppressed', 'invalid_email',
]);

// ---------------- Provider CRUD ----------------

export async function listProviders() { return prisma.emailProvider.findMany({ orderBy: { createdAt: 'desc' } }); }
export async function getProviderRecord(id) {
  const p = await prisma.emailProvider.findUnique({ where: { id } });
  if (!p) throw new AppError('email_provider_not_found', `Provider ${id} não encontrado`, 404);
  return p;
}
export async function createProvider(data) { return prisma.emailProvider.create({ data }); }
export async function updateProvider(id, data) { await getProviderRecord(id); return prisma.emailProvider.update({ where: { id }, data }); }
export async function deleteProvider(id) { await getProviderRecord(id); return prisma.emailProvider.delete({ where: { id } }); }

// ---------------- Test connection ----------------

export async function testConnection(id) {
  const cfg = await getProviderRecord(id);
  const impl = getProvider(cfg.providerType);
  try { return await impl.testConnection(cfg); }
  catch (err) {
    if (err instanceof EmailProviderError) {
      throw new AppError(err.code, err.message, mapErrorStatus(err.code), err.detail);
    }
    throw err;
  }
}

// ---------------- Templates CRUD ----------------

export async function listTemplates() { return prisma.emailTemplate.findMany({ orderBy: { createdAt: 'desc' } }); }
export async function getTemplateRecord(id) {
  const t = await prisma.emailTemplate.findUnique({ where: { id } });
  if (!t) throw new AppError('email_template_not_found', `Template ${id} não encontrado`, 404);
  return t;
}
export async function createTemplate(data) { return prisma.emailTemplate.create({ data }); }
export async function updateTemplate(id, data) { await getTemplateRecord(id); return prisma.emailTemplate.update({ where: { id }, data }); }
export async function deleteTemplate(id) { await getTemplateRecord(id); return prisma.emailTemplate.delete({ where: { id } }); }

// ---------------- Send ----------------

/**
 * Função interna usada pelo controller E pelo Motor de Campanha (futuro).
 *
 * Retorno: { success, messageId, status, error?, providerResponse? }
 */
export async function sendEmail({
  providerId, to, subject, html, text, templateId, variables = {},
  attachments, campaignId, leadId, userId,
}) {
  // 1) Provider
  const cfg = await getProviderRecord(providerId);
  if (!cfg.active) {
    return _result(false, null, 'failed', { error: 'email_provider_inactive', message: `Provider ${cfg.providerName} está desativado` });
  }

  // 2) Email válido
  if (!isValidEmail(to)) {
    return _result(false, null, 'rejected', { error: 'invalid_email', message: `Email inválido: ${to}` });
  }
  const toLower = normalizeEmail(to);

  // 3) Suppression check
  const suppressed = await prisma.emailSuppression.findUnique({ where: { emailLower: toLower } });
  if (suppressed) {
    return _result(false, null, 'rejected', { error: 'suppressed', message: `Email em supressão (${suppressed.reason})`, detail: { reason: suppressed.reason, source: suppressed.source } });
  }

  // 4) Limites
  await _enforceRateLimits(cfg);

  // 5) Resolve template (se houver)
  let renderedSubject = subject;
  let renderedHtml = html;
  let renderedText = text;
  let template = null;
  let finalAttachments = attachments;
  if (templateId) {
    template = await getTemplateRecord(templateId);
    if (!template.active) {
      return _result(false, null, 'failed', { error: 'template_inactive', message: `Template ${template.name} está inativo` });
    }
    const subjResult = renderTemplate(template.subject, variables);
    const htmlResult = renderTemplate(template.htmlBody, variables);
    const textResult = template.textBody ? renderTemplate(template.textBody, variables) : { rendered: null, missing: [] };
    const allMissing = [...new Set([...subjResult.missing, ...htmlResult.missing, ...textResult.missing])];
    // Variáveis obrigatórias declaradas no template precisam estar presentes
    const required = template.allowedVariables ?? [];
    const missingRequired = required.filter(v => allMissing.includes(v) || variables[v] === undefined);
    if (missingRequired.length) {
      return _result(false, null, 'failed', { error: 'template_missing_vars', message: `Variáveis obrigatórias ausentes: ${missingRequired.join(', ')}`, detail: { missing: missingRequired } });
    }
    renderedSubject = subjResult.rendered || template.subject;
    renderedHtml    = htmlResult.rendered;
    renderedText    = textResult.rendered ?? text;
    finalAttachments = attachments ?? template.attachments;
  } else if (variables && (html || text)) {
    // Render inline mesmo sem template
    if (html) renderedHtml = renderTemplate(html, variables).rendered;
    if (text) renderedText = renderTemplate(text, variables).rendered;
    if (subject) renderedSubject = renderTemplate(subject, variables).rendered;
  }

  // 6) Dedup determinístico (campanha+lead+to+subject+payload)
  const dedupKey = _buildDedupKey({ providerId: cfg.id, leadId, campaignId, to: toLower, subject: renderedSubject, html: renderedHtml });

  // 7) UPSERT
  const message = await prisma.emailMessage.upsert({
    where: { dedupKey },
    create: {
      providerId: cfg.id,
      templateId: template?.id ?? null,
      toEmail: toLower,
      fromEmail: cfg.fromEmail,
      fromName: cfg.fromName,
      replyTo: cfg.replyTo,
      subject: renderedSubject,
      htmlBody: renderedHtml ?? null,
      textBody: renderedText ?? null,
      attachments: finalAttachments ?? null,
      campaignId: campaignId ?? null,
      leadId: leadId ?? null,
      triggeredByUserId: userId ?? null,
      dedupKey,
    },
    update: {},
  });

  if (['sent', 'delivered', 'opened', 'clicked'].includes(message.status)) {
    return _result(true, message.providerMessageId, message.status, { deduplicated: true });
  }

  return processMessage(message.id);
}

/** Worker chama isso no retry. */
export async function processMessage(messageId) {
  const m = await prisma.emailMessage.findUnique({ where: { id: messageId }, include: { provider: true, template: true } });
  if (!m) throw new AppError('email_message_not_found', `Mensagem ${messageId} não encontrada`, 404);
  if (m.status === 'sent') return _result(true, m.providerMessageId, m.status);

  const cfg = m.provider;
  const impl = getProvider(cfg.providerType);

  const attempt = m.attempts + 1;
  await prisma.emailMessage.update({ where: { id: m.id }, data: { status: 'queued', attempts: attempt } });

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
    const result = await impl.sendEmail(cfg, {
      to: m.toEmail,
      fromEmail: cfg.fromEmail,
      fromName: cfg.fromName,
      replyTo: cfg.replyTo,
      subject: m.subject,
      htmlBody: m.htmlBody,
      textBody: m.textBody,
      attachments: m.attachments,
    });
    providerMessageId = result.providerMessageId;
    providerStatus = result.providerStatus;
    raw = result.raw;
    requestSent = result.requestSent;
    durationMs = result.durationMs;
    httpStatus = result.httpStatus ?? null;
  } catch (err) {
    if (err instanceof EmailProviderError) {
      outcome = err.code === 'invalid_recipient' ? 'rejected' : 'failed';
      errorMessage = err.message;
      errorCode = err.code;
      raw = err.detail?.raw ?? err.detail ?? null;
      requestSent = err.detail?.requestSent ?? null;
      httpStatus = err.detail?.httpStatus ?? null;
    } else {
      outcome = 'failed';
      errorMessage = err.message;
      errorCode = 'internal_error';
      logger.error({ err, messageId }, 'email_send_internal_error');
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const data = { status: outcome, providerMessageId, lastError: errorMessage };
    if (outcome === 'sent') {
      data.sentAt = new Date();
      data.nextRetryAt = null;
    } else if (outcome === 'failed') {
      const nonRetryable = NON_RETRYABLE_CODES.has(errorCode) || attempt >= MAX_EMAIL_ATTEMPTS;
      data.nextRetryAt = nonRetryable ? null : _computeNextRetry(attempt);
      if (attempt >= MAX_EMAIL_ATTEMPTS) data.failedAt = new Date();
    } else if (outcome === 'rejected') {
      data.nextRetryAt = null;
      data.failedAt = new Date();
    }
    const next = await tx.emailMessage.update({ where: { id: m.id }, data });
    await tx.emailMessageLog.create({
      data: {
        messageId: m.id, attempt, status: outcome, providerName: cfg.providerName,
        rawRequest: requestSent, rawResponse: raw, httpStatus, errorMessage, errorCode, durationMs,
      },
    });
    return next;
  });

  return _result(outcome === 'sent', providerMessageId, outcome, errorMessage ? { error: errorCode, message: errorMessage } : {});
}

// ---------------- Webhook ----------------

export async function handleWebhook({ providerId, headers, rawBody }) {
  const cfg = await getProviderRecord(providerId);
  const impl = getProvider(cfg.providerType);
  const signatureValid = impl.verifyWebhookSignature(cfg, headers, rawBody);

  let parsed;
  try { parsed = await impl.parseWebhook(cfg, headers, rawBody); }
  catch (err) { parsed = { events: [{ providerMessageId: null, recipientEmail: null, eventType: 'unknown', raw: { parse_error: err.message } }] }; }

  const persisted = [];
  for (const ev of parsed.events) {
    const message = ev.providerMessageId
      ? await prisma.emailMessage.findFirst({ where: { providerId, providerMessageId: ev.providerMessageId } })
      : null;

    const persistedEv = await prisma.emailWebhookEvent.create({
      data: {
        providerId,
        messageId: message?.id ?? null,
        eventType: ev.eventType,
        providerMessageId: ev.providerMessageId,
        recipientEmail: ev.recipientEmail ? normalizeEmail(ev.recipientEmail) : null,
        rawHeaders: _serializeHeaders(headers),
        rawBody: typeof rawBody === 'string' ? _safeJson(rawBody) ?? { raw: rawBody.slice(0, 4000) } : rawBody,
        signatureValid,
        processed: signatureValid,
        processingError: signatureValid ? null : 'webhook_signature_invalid',
      },
    });
    persisted.push(persistedEv);

    if (signatureValid) {
      // Atualiza status da mensagem
      if (message) await _applyWebhookToMessage(message, ev);
      // Adiciona à supressão se for bounce/complaint/unsubscribe
      if (['bounced', 'complained', 'unsubscribed'].includes(ev.eventType) && ev.recipientEmail) {
        await prisma.emailSuppression.upsert({
          where: { emailLower: normalizeEmail(ev.recipientEmail) || '' },
          create: {
            emailLower: normalizeEmail(ev.recipientEmail),
            reason: ev.eventType === 'bounced' ? 'bounce' : ev.eventType === 'complained' ? 'complaint' : 'unsubscribe',
            source: `webhook:${cfg.providerName}`,
            detail: typeof ev.raw === 'object' ? JSON.stringify(ev.raw).slice(0, 500) : String(ev.raw).slice(0, 500),
          },
          update: {}, // não sobrescreve — first source wins
        });
      }
    }
  }

  return { signatureValid, eventsCount: persisted.length };
}

async function _applyWebhookToMessage(message, ev) {
  const data = {};
  switch (ev.eventType) {
    case 'delivered':    data.status = 'delivered';    data.deliveredAt = new Date(); break;
    case 'opened':       data.status = 'opened';       data.openedAt    = new Date(); break;
    case 'clicked':      data.status = 'clicked';      data.clickedAt   = new Date(); break;
    case 'bounced':      data.status = 'bounced';      data.bouncedAt   = new Date(); break;
    case 'complained':   data.status = 'complained';   break;
    case 'unsubscribed': data.status = 'unsubscribed'; break;
    case 'failed':       data.status = 'failed';       data.failedAt    = new Date(); break;
    default: return;
  }
  await prisma.emailMessage.update({ where: { id: message.id }, data });
}

// ---------------- Status (dashboard) ----------------

export async function getStatus() {
  const [providers, providersActive, sent, delivered, opened, clicked, bounced, failed, complained, lastError, lastSent] = await Promise.all([
    prisma.emailProvider.count(),
    prisma.emailProvider.count({ where: { active: true } }),
    prisma.emailMessage.count({ where: { status: { in: ['sent', 'delivered', 'opened', 'clicked'] } } }),
    prisma.emailMessage.count({ where: { status: { in: ['delivered', 'opened', 'clicked'] } } }),
    prisma.emailMessage.count({ where: { status: { in: ['opened', 'clicked'] } } }),
    prisma.emailMessage.count({ where: { status: 'clicked' } }),
    prisma.emailMessage.count({ where: { status: 'bounced' } }),
    prisma.emailMessage.count({ where: { status: { in: ['failed', 'rejected'] } } }),
    prisma.emailMessage.count({ where: { status: 'complained' } }),
    prisma.emailMessage.findFirst({ where: { lastError: { not: null } }, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true, lastError: true } }),
    prisma.emailMessage.findFirst({ where: { sentAt: { not: null } }, orderBy: { sentAt: 'desc' }, select: { sentAt: true, providerId: true } }),
  ]);
  const openRate    = sent > 0 ? opened / sent : null;
  const clickRate   = sent > 0 ? clicked / sent : null;
  const bounceRate  = sent > 0 ? bounced / sent : null;
  const successRate = (sent + failed) > 0 ? sent / (sent + failed) : null;
  return {
    providers: { total: providers, active: providersActive },
    counts: { sent, delivered, opened, clicked, bounced, complained, failed },
    rates: { open: openRate, click: clickRate, bounce: bounceRate, success: successRate },
    lastSent,
    lastError,
  };
}

// ---------------- Suppression ----------------

export async function addSuppression({ email, reason, source, detail }) {
  const e = normalizeEmail(email);
  if (!e) throw new AppError('invalid_email', `Email inválido: ${email}`, 400);
  return prisma.emailSuppression.upsert({
    where: { emailLower: e },
    create: { emailLower: e, reason, source, detail },
    update: { reason, source, detail },
  });
}

// ---------------- Helpers ----------------

function _result(success, messageId, status, extra = {}) {
  return { success, messageId, status, ...extra };
}

function _buildDedupKey({ providerId, leadId, campaignId, to, subject, html }) {
  const h = crypto.createHash('sha256');
  h.update(providerId); h.update('|');
  h.update(to); h.update('|');
  h.update(leadId || ''); h.update('|');
  h.update(campaignId || ''); h.update('|');
  h.update(subject || ''); h.update('|');
  h.update(html ? crypto.createHash('sha256').update(html).digest('hex') : '');
  return h.digest('hex');
}

function _computeNextRetry(attempt) {
  if (attempt >= MAX_EMAIL_ATTEMPTS) return null;
  const delay = RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
  return new Date(Date.now() + delay);
}

async function _enforceRateLimits(cfg) {
  if (!cfg.dailyLimit && !cfg.hourlyLimit) return;
  const now = new Date();
  if (cfg.hourlyLimit) {
    const hourAgo = new Date(now.getTime() - 60 * 60_000);
    const count = await prisma.emailMessage.count({
      where: { providerId: cfg.id, createdAt: { gte: hourAgo }, status: { in: ['sent', 'queued', 'delivered', 'opened', 'clicked'] } },
    });
    if (count >= cfg.hourlyLimit) {
      throw new AppError('hourly_limit_reached', `Limite horário do provider ${cfg.providerName} atingido (${count}/${cfg.hourlyLimit})`, 429);
    }
  }
  if (cfg.dailyLimit) {
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60_000);
    const count = await prisma.emailMessage.count({
      where: { providerId: cfg.id, createdAt: { gte: dayAgo }, status: { in: ['sent', 'queued', 'delivered', 'opened', 'clicked'] } },
    });
    if (count >= cfg.dailyLimit) {
      throw new AppError('daily_limit_reached', `Limite diário do provider ${cfg.providerName} atingido (${count}/${cfg.dailyLimit})`, 429);
    }
  }
}

function mapErrorStatus(code) {
  if (code === 'credentials_missing') return 503;
  if (['invalid_email', 'template_missing_vars', 'invalid_recipient', 'attachments_not_supported'].includes(code)) return 400;
  if (code === 'auth_error' || code === 'sender_not_verified') return 502;
  if (code === 'rate_limited') return 429;
  return 500;
}

function _serializeHeaders(h) {
  const out = {};
  if (!h) return out;
  for (const [k, v] of Object.entries(h)) if (typeof v === 'string') out[k.toLowerCase()] = v;
  return out;
}
function _safeJson(s) { try { return JSON.parse(s); } catch { return null; } }
