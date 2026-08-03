import { prisma } from '../../db/prisma.js';
import * as svc from './email.service.js';
import {
  ProviderCreateSchema, ProviderUpdateSchema,
  SendEmailSchema, SendTemplateSchema,
  TemplateCreateSchema, TemplateUpdateSchema,
  ListMessagesSchema, ListLogsSchema,
} from './email.validator.js';

function publicProvider(p) {
  if (!p) return null;
  const { password, apiKey, secretKey, bearerToken, webhookSecret, ...rest } = p;
  return {
    ...rest,
    passwordSet: !!password,
    apiKeySet: !!apiKey,
    secretKeySet: !!secretKey,
    bearerTokenSet: !!bearerToken,
    webhookSecretSet: !!webhookSecret,
  };
}

// ---------------- Providers ----------------

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
    const data = SendEmailSchema.parse(req.body);
    const out = await svc.sendEmail({
      providerId: data.providerId,
      to: data.to,
      subject: data.subject,
      html: data.html,
      text: data.text,
      templateId: data.templateId,
      variables: data.variables,
      attachments: data.attachments,
      campaignId: data.metadata?.campaignId,
      leadId: data.metadata?.leadId,
      userId: req.user?.sub,
    });
    res.status(out.success ? 200 : 202).json(out);
  } catch (err) { next(err); }
}

export async function postSendTemplate(req, res, next) {
  try {
    const data = SendTemplateSchema.parse(req.body);
    const out = await svc.sendEmail({
      providerId: data.providerId,
      to: data.to,
      subject: '', // resolvido pelo template
      templateId: data.templateId,
      variables: data.variables,
      attachments: data.attachments,
      campaignId: data.metadata?.campaignId,
      leadId: data.metadata?.leadId,
      userId: req.user?.sub,
    });
    res.status(out.success ? 200 : 202).json(out);
  } catch (err) { next(err); }
}

// ---------------- Webhook (público) ----------------

export async function postWebhook(req, res, next) {
  try {
    const providerId = req.params.providerId;
    const rawBody = req.rawBody ?? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));
    const result = await svc.handleWebhook({ providerId, headers: req.headers, rawBody });
    if (!result.signatureValid) {
      return res.status(401).json({ error: 'webhook_signature_invalid', accepted_for_audit: result.eventsCount });
    }
    res.json({ ok: true, eventsCount: result.eventsCount });
  } catch (err) { next(err); }
}

// ---------------- Listings ----------------

export async function getMessages(req, res, next) {
  try {
    const q = ListMessagesSchema.parse(req.query);
    const where = {};
    if (q.providerId) where.providerId = q.providerId;
    if (q.status) where.status = q.status;
    if (q.campaignId) where.campaignId = q.campaignId;
    if (q.leadId) where.leadId = q.leadId;
    if (q.toEmail) where.toEmail = q.toEmail.toLowerCase();
    const [items, total] = await Promise.all([
      prisma.emailMessage.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      prisma.emailMessage.count({ where }),
    ]);
    res.json({ page: q.page, pageSize: q.pageSize, total, items });
  } catch (err) { next(err); }
}

export async function getMessage(req, res, next) {
  try {
    const m = await prisma.emailMessage.findUnique({ where: { id: req.params.id }, include: { provider: { select: { providerName: true, providerType: true } } } });
    if (!m) return res.status(404).json({ error: 'email_message_not_found' });
    res.json({ message: m });
  } catch (err) { next(err); }
}

export async function getLogs(req, res, next) {
  try {
    const q = ListLogsSchema.parse(req.query);
    const where = q.messageId ? { messageId: q.messageId } : {};
    const [items, total] = await Promise.all([
      prisma.emailMessageLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      prisma.emailMessageLog.count({ where }),
    ]);
    res.json({ page: q.page, pageSize: q.pageSize, total, items });
  } catch (err) { next(err); }
}

export async function getStatus(_req, res, next) {
  try { res.json(await svc.getStatus()); }
  catch (err) { next(err); }
}

// ---------------- Templates CRUD ----------------

export async function listTemplates(_req, res, next) {
  try { res.json({ items: await svc.listTemplates() }); }
  catch (err) { next(err); }
}
export async function postTemplate(req, res, next) {
  try {
    const data = TemplateCreateSchema.parse(req.body);
    const t = await svc.createTemplate(data);
    res.status(201).json({ template: t });
  } catch (err) { next(err); }
}
export async function putTemplate(req, res, next) {
  try {
    const data = TemplateUpdateSchema.parse(req.body);
    const t = await svc.updateTemplate(req.params.id, data);
    res.json({ template: t });
  } catch (err) { next(err); }
}
export async function deleteTemplate(req, res, next) {
  try {
    await svc.deleteTemplate(req.params.id);
    res.status(204).end();
  } catch (err) { next(err); }
}
