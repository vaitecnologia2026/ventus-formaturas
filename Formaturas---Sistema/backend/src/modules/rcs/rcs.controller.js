import { prisma } from '../../db/prisma.js';
import * as svc from './rcs.service.js';
import {
  ProviderCreateSchema, ProviderUpdateSchema,
  SendMessageSchema, SendTemplateSchema,
  ListMessagesSchema, ListLogsSchema,
} from './rcs.validator.js';

// Sanitiza credenciais ao retornar provider em respostas HTTP
function publicProvider(p) {
  if (!p) return null;
  const { apiKey, bearerToken, password, clientSecret, webhookSecret, ...rest } = p;
  return {
    ...rest,
    apiKeySet: !!apiKey,
    bearerTokenSet: !!bearerToken,
    passwordSet: !!password,
    clientSecretSet: !!clientSecret,
    webhookSecretSet: !!webhookSecret,
  };
}

// ---------------- Provider CRUD ----------------

export async function listProviders(_req, res, next) {
  try {
    const items = await svc.listProviders();
    res.json({ items: items.map(publicProvider) });
  } catch (err) { next(err); }
}

export async function getProvider(req, res, next) {
  try {
    const p = await svc.getProviderRecord(req.params.id);
    res.json({ provider: publicProvider(p) });
  } catch (err) { next(err); }
}

export async function postProvider(req, res, next) {
  try {
    const data = ProviderCreateSchema.parse(req.body);
    const p = await svc.createProvider(data);
    res.status(201).json({ provider: publicProvider(p) });
  } catch (err) { next(err); }
}

export async function putProvider(req, res, next) {
  try {
    const data = ProviderUpdateSchema.parse(req.body);
    const p = await svc.updateProvider(req.params.id, data);
    res.json({ provider: publicProvider(p) });
  } catch (err) { next(err); }
}

export async function deleteProvider(req, res, next) {
  try {
    await svc.deleteProvider(req.params.id);
    res.status(204).end();
  } catch (err) { next(err); }
}

// ---------------- Operations ----------------

export async function postTestConnection(req, res, next) {
  try {
    const id = req.body?.providerId || req.query?.providerId;
    if (!id) return res.status(400).json({ error: 'validation_error', message: 'providerId é obrigatório' });
    const result = await svc.testConnection(id);
    res.json(result);
  } catch (err) { next(err); }
}

export async function postSend(req, res, next) {
  try {
    const data = SendMessageSchema.parse(req.body);
    const out = await svc.sendMessage(data, { userId: req.user?.sub });
    if (out.deduplicated) return res.status(200).json({ ok: true, deduplicated: true, message: out.message });
    res.status(out.status === 'sent' ? 200 : 202).json({ ok: out.status === 'sent', message: out });
  } catch (err) { next(err); }
}

export async function postSendTemplate(req, res, next) {
  try {
    const data = SendTemplateSchema.parse(req.body);
    const tmpl = await prisma.rcsTemplate.findUnique({ where: { id: data.templateId } });
    if (!tmpl) return res.status(404).json({ error: 'rcs_template_not_found' });
    if (tmpl.providerId !== data.providerId) {
      return res.status(400).json({ error: 'template_provider_mismatch', message: 'Template não pertence a esse provider' });
    }
    const out = await svc.sendMessage({
      providerId: data.providerId,
      to: data.to,
      messageType: tmpl.messageType,
      payload: tmpl.definition,
      templateId: tmpl.id,
      vars: data.vars,
      metadata: data.metadata,
    }, { userId: req.user?.sub });
    res.status(out.status === 'sent' ? 200 : 202).json({ ok: out.status === 'sent', message: out });
  } catch (err) { next(err); }
}

// Webhook: PÚBLICO. raw body necessário pra HMAC.
export async function postWebhook(req, res, next) {
  try {
    const providerId = req.params.providerId;
    const rawBody = req.rawBody ?? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));
    const result = await svc.handleWebhook({ providerId, headers: req.headers, rawBody });
    if (!result.signatureValid) {
      // Persistimos o evento como audit, mas devolvemos 401 pra desencorajar replay malicioso
      return res.status(401).json({ error: 'webhook_signature_invalid', accepted_for_audit: result.eventsCount });
    }
    res.json({ ok: true, eventsCount: result.eventsCount });
  } catch (err) { next(err); }
}

export async function getMessages(req, res, next) {
  try {
    const q = ListMessagesSchema.parse(req.query);
    const where = {};
    if (q.providerId) where.providerId = q.providerId;
    if (q.status) where.status = q.status;
    if (q.campaignId) where.campaignId = q.campaignId;
    if (q.leadId) where.leadId = q.leadId;
    const [items, total] = await Promise.all([
      prisma.rcsMessage.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      prisma.rcsMessage.count({ where }),
    ]);
    res.json({ page: q.page, pageSize: q.pageSize, total, items });
  } catch (err) { next(err); }
}

export async function getMessage(req, res, next) {
  try {
    const m = await prisma.rcsMessage.findUnique({ where: { id: req.params.id }, include: { provider: { select: { providerName: true, providerKind: true } } } });
    if (!m) return res.status(404).json({ error: 'rcs_message_not_found' });
    res.json({ message: m });
  } catch (err) { next(err); }
}

export async function getLogs(req, res, next) {
  try {
    const q = ListLogsSchema.parse(req.query);
    const where = q.messageId ? { messageId: q.messageId } : {};
    const [items, total] = await Promise.all([
      prisma.rcsMessageLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      prisma.rcsMessageLog.count({ where }),
    ]);
    res.json({ page: q.page, pageSize: q.pageSize, total, items });
  } catch (err) { next(err); }
}

export async function getStatus(_req, res, next) {
  try {
    const s = await svc.getStatus();
    res.json(s);
  } catch (err) { next(err); }
}
