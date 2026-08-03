import { prisma } from '../db/prisma.js';
import {
  testConnection,
  enqueueConversion,
  processConversion,
  retryFailedNow,
  MAX_ATTEMPTS,
} from '../services/google-ads.service.js';
import {
  getCredentials,
  upsertCredentials,
  publicView,
} from '../services/credentials.service.js';
import {
  ConfigSchema,
  UploadConversionSchema,
  ListQuerySchema,
  LogsQuerySchema,
} from '../validators/google-ads.schemas.js';

/** GET /api/google-ads/status — visão consolidada para o dashboard. */
export async function getStatus(_req, res, next) {
  try {
    const creds = await getCredentials();
    const credConfigured = !!(creds?.customerId && creds?.developerToken && creds?.refreshToken);

    const [pending, retrying, sent, failed, missing, ignored, last] = await Promise.all([
      prisma.googleAdsConversion.count({ where: { status: 'pending' } }),
      prisma.googleAdsConversion.count({ where: { status: 'retrying' } }),
      prisma.googleAdsConversion.count({ where: { status: 'sent' } }),
      prisma.googleAdsConversion.count({ where: { status: 'failed' } }),
      prisma.googleAdsConversion.count({ where: { status: 'missing_required_data' } }),
      prisma.googleAdsConversion.count({ where: { status: 'ignored' } }),
      prisma.googleAdsConversion.findFirst({
        where: { status: 'sent' },
        orderBy: { sentAt: 'desc' },
        select: { sentAt: true, conversionEvent: true },
      }),
    ]);

    const lastError = await prisma.googleAdsConversion.findFirst({
      where: { lastError: { not: null } },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true, lastError: true, conversionEvent: true },
    });

    const totalAttempted = sent + failed + missing;
    const successRate = totalAttempted > 0 ? sent / totalAttempted : null;

    res.json({
      credentialsConfigured: credConfigured,
      uploadMode: creds?.uploadMode ?? null,
      counts: { pending, retrying, sent, failed, missing_required_data: missing, ignored },
      successRate,
      lastSent: last ? { at: last.sentAt, event: last.conversionEvent } : null,
      lastError: lastError ? { at: lastError.updatedAt, event: lastError.conversionEvent, message: lastError.lastError } : null,
    });
  } catch (err) { next(err); }
}

/** POST /api/google-ads/config — cria ou atualiza credenciais. */
export async function postConfig(req, res, next) {
  try {
    const data = ConfigSchema.parse(req.body);
    const saved = await upsertCredentials(data);
    res.json({ ok: true, credentials: publicView(saved) });
  } catch (err) { next(err); }
}

/** POST /api/google-ads/test-connection — executa GAQL trivial. */
export async function postTestConnection(_req, res, next) {
  try {
    const result = await testConnection();
    res.json(result);
  } catch (err) { next(err); }
}

/** POST /api/google-ads/upload-conversion — enfileira E processa imediatamente. */
export async function postUploadConversion(req, res, next) {
  try {
    const data = UploadConversionSchema.parse(req.body);
    const queued = await enqueueConversion(data);
    if (queued.status === 'sent') {
      // Já enviada antes (dedup) — devolve sem reprocessar
      return res.status(200).json({ ok: true, deduplicated: true, conversion: queued });
    }
    const processed = await processConversion(queued.id);
    res.status(processed.status === 'sent' ? 200 : 202).json({ ok: processed.status === 'sent', conversion: processed });
  } catch (err) { next(err); }
}

/** POST /api/google-ads/retry-failed — reprocessa todas as failed elegíveis. */
export async function postRetryFailed(_req, res, next) {
  try {
    const { rescheduled, ids } = await retryFailedNow();
    const results = [];
    for (const id of ids) {
      try {
        const r = await processConversion(id);
        results.push({ id, status: r.status });
      } catch (err) {
        results.push({ id, status: 'error', error: err.message });
      }
    }
    res.json({ rescheduled, processed: results.length, results, maxAttempts: MAX_ATTEMPTS });
  } catch (err) { next(err); }
}

/** GET /api/google-ads/conversions — lista paginada com filtros. */
export async function getConversions(req, res, next) {
  try {
    const q = ListQuerySchema.parse(req.query);
    const where = {};
    if (q.status) where.status = q.status;
    if (q.conversionEvent) where.conversionEvent = q.conversionEvent;
    const [items, total] = await Promise.all([
      prisma.googleAdsConversion.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.googleAdsConversion.count({ where }),
    ]);
    res.json({ page: q.page, pageSize: q.pageSize, total, items });
  } catch (err) { next(err); }
}

/** GET /api/google-ads/logs — audit trail. */
export async function getLogs(req, res, next) {
  try {
    const q = LogsQuerySchema.parse(req.query);
    const where = {};
    if (q.conversionId) where.conversionId = q.conversionId;
    const [items, total] = await Promise.all([
      prisma.googleAdsConversionLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.googleAdsConversionLog.count({ where }),
    ]);
    res.json({ page: q.page, pageSize: q.pageSize, total, items });
  } catch (err) { next(err); }
}
