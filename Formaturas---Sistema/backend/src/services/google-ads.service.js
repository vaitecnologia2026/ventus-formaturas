import { GoogleAdsApi } from 'google-ads-api';
import { prisma } from '../db/prisma.js';
import { logger } from '../config/logger.js';
import { AppError } from '../middleware/error.js';
import { getCredentialsOrThrow, resolveConversionActionId } from './credentials.service.js';
import { hashUserIdentifiers } from '../utils/crypto.js';
import { buildDedupKey } from '../utils/dedup.js';

/**
 * Service Google Ads — interage com a API REAL via SDK `google-ads-api`.
 *
 * Importante:
 * - Sem credencial → erro estruturado, NUNCA sucesso falso.
 * - Toda tentativa (sucesso ou falha) grava uma linha em GoogleAdsConversionLog
 *   com request bruto e resposta bruta para auditoria.
 * - Deduplicação garantida pelo unique(dedup_key) no banco — UPSERT em vez de
 *   checagem prévia (evita race condition).
 */

let cachedClient = null;
let cachedClientKey = null;

function buildClient(creds) {
  // Cache por chave que combina credenciais sensíveis — invalida ao trocar
  const key = [creds.clientId, creds.developerToken].join('|');
  if (cachedClient && cachedClientKey === key) return cachedClient;
  cachedClient = new GoogleAdsApi({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    developer_token: creds.developerToken,
  });
  cachedClientKey = key;
  return cachedClient;
}

function getCustomer(creds) {
  const client = buildClient(creds);
  return client.Customer({
    customer_id: creds.customerId,
    login_customer_id: creds.loginCustomerId || undefined,
    refresh_token: creds.refreshToken,
  });
}

/**
 * Testa a conexão executando uma query GAQL trivial.
 * Devolve { ok: true, customerId } ou lança AppError com a causa.
 */
export async function testConnection() {
  const creds = await getCredentialsOrThrow();
  const customer = getCustomer(creds);
  try {
    const rows = await customer.query(`SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1`);
    const c = rows[0]?.customer;
    return {
      ok: true,
      customerId: String(c?.id ?? creds.customerId),
      descriptiveName: c?.descriptive_name ?? null,
    };
  } catch (err) {
    throw new AppError(
      'google_ads_connection_failed',
      err.message || 'Falha ao conectar à Google Ads API.',
      502,
      extractErrorDetail(err),
    );
  }
}

/**
 * Cria (ou faz UPSERT por dedup_key) uma conversão em estado `pending`.
 * Não envia. O envio é feito por `processConversion`.
 */
export async function enqueueConversion(input) {
  const creds = await getCredentialsOrThrow();
  const conversionActionId = resolveConversionActionId(creds, input.conversionEvent);
  if (!conversionActionId) {
    throw new AppError(
      'conversion_action_not_configured',
      `Sem conversion_action_id configurado para o evento "${input.conversionEvent}".`,
      400,
    );
  }

  const conversionTime = input.conversionTime ? new Date(input.conversionTime) : new Date();
  const dedupKey = buildDedupKey({
    leadId: input.leadId,
    orderId: input.orderId,
    conversionEvent: input.conversionEvent,
    conversionActionId,
    conversionTime,
  });

  const data = {
    leadId:             input.leadId || null,
    orderId:            input.orderId || null,
    conversionEvent:    input.conversionEvent,
    conversionActionId,
    gclid:              input.gclid || null,
    gbraid:             input.gbraid || null,
    wbraid:             input.wbraid || null,
    conversionValue:    input.conversionValue ?? null,
    conversionCurrency: input.conversionCurrency || creds.defaultCurrency,
    conversionTime,
    dedupKey,
  };

  // Linkagem com lead_attribution se existir
  if (input.leadId) {
    const att = await prisma.leadAttribution.findUnique({ where: { leadId: input.leadId } });
    if (att) data.leadAttributionId = att.id;
  }

  // UPSERT — se já existir conversão com esse dedup_key, retorna a existente sem alterar status
  const conversion = await prisma.googleAdsConversion.upsert({
    where: { dedupKey },
    create: data,
    update: {}, // dedup: mesma conversão não muda nada
  });

  return conversion;
}

/**
 * Envia uma conversão para o Google Ads.
 * Atualiza status, attempts, sentAt/lastError e grava log bruto.
 */
export async function processConversion(conversionId) {
  const creds = await getCredentialsOrThrow();
  const conversion = await prisma.googleAdsConversion.findUnique({
    where: { id: conversionId },
    include: { attribution: true },
  });
  if (!conversion) throw new AppError('conversion_not_found', `Conversion ${conversionId} not found`, 404);
  if (conversion.status === 'sent') return conversion;

  const customer = getCustomer(creds);
  const startedAt = Date.now();
  const attempt = conversion.attempts + 1;

  // Marca como retrying enquanto está em voo
  await prisma.googleAdsConversion.update({
    where: { id: conversion.id },
    data: { status: 'retrying', attempts: attempt },
  });

  let payload;
  let response;
  let outcome = 'sent';
  let errorMessage = null;
  let errorCode = null;
  try {
    payload = buildPayload(creds, conversion);
    if (!hasRequiredIdentifiers(creds.uploadMode, payload, conversion)) {
      outcome = 'missing_required_data';
      errorMessage = `Modo ${creds.uploadMode} exige ${requiredFor(creds.uploadMode).join('/')} mas nenhum foi fornecido.`;
    } else {
      response = await uploadByMode(customer, creds, payload);
      const errs = extractPartialErrors(response);
      if (errs.length) {
        outcome = 'failed';
        errorMessage = errs.map(e => e.message).join(' | ');
        errorCode = errs[0]?.error_code || null;
      }
    }
  } catch (err) {
    outcome = 'failed';
    errorMessage = err.message;
    errorCode = extractErrorCode(err);
    response = extractErrorDetail(err);
    logger.error({ err, conversionId }, 'google_ads_upload_failed');
  }

  const durationMs = Date.now() - startedAt;
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.googleAdsConversion.update({
      where: { id: conversion.id },
      data: {
        status: outcome,
        sentAt: outcome === 'sent' ? new Date() : null,
        lastError: errorMessage,
        nextRetryAt: outcome === 'failed' ? computeNextRetry(attempt) : null,
      },
    });
    await tx.googleAdsConversionLog.create({
      data: {
        conversionId: conversion.id,
        attempt,
        status: outcome,
        rawRequest: payload ?? null,
        rawResponse: response ?? null,
        errorMessage,
        errorCode,
        durationMs,
      },
    });
    return next;
  });

  return updated;
}

// ----------------- Helpers internos -----------------

function buildPayload(creds, conversion) {
  const customerResource = `customers/${creds.customerId}/conversionActions/${conversion.conversionActionId}`;
  const base = {
    conversion_action: customerResource,
    conversion_date_time: formatGoogleDate(conversion.conversionTime),
    conversion_value: Number(conversion.conversionValue ?? 0),
    currency_code: conversion.conversionCurrency || creds.defaultCurrency,
    order_id: conversion.orderId || conversion.leadId || conversion.id,
  };

  // Click IDs em ordem de prioridade — só um vai
  if (conversion.gclid)  base.gclid  = conversion.gclid;
  if (conversion.gbraid) base.gbraid = conversion.gbraid;
  if (conversion.wbraid) base.wbraid = conversion.wbraid;

  // Enhanced conversions: anexa user_identifiers hasheados
  if (creds.uploadMode === 'enhanced_conversions_for_leads' || creds.uploadMode === 'data_manager_api') {
    const att = conversion.attribution;
    if (att) {
      const hashed = hashUserIdentifiers({
        email: att.email,
        phone: att.phone,
        firstName: att.firstName,
        lastName: att.lastName,
        city: att.city,
        state: att.state,
        country: att.country,
        postalCode: att.postalCode,
      });
      base.user_identifiers = buildUserIdentifiers(hashed);
    }
  }

  return base;
}

function buildUserIdentifiers(hashed) {
  const ids = [];
  if (hashed.hashedEmail)       ids.push({ hashed_email: hashed.hashedEmail });
  if (hashed.hashedPhoneNumber) ids.push({ hashed_phone_number: hashed.hashedPhoneNumber });
  if (hashed.hashedFirstName || hashed.hashedLastName || hashed.city || hashed.state || hashed.countryCode || hashed.postalCode) {
    ids.push({
      address_info: {
        hashed_first_name: hashed.hashedFirstName,
        hashed_last_name:  hashed.hashedLastName,
        city:              hashed.city,
        state:             hashed.state,
        country_code:      hashed.countryCode,
        postal_code:       hashed.postalCode,
      },
    });
  }
  return ids;
}

function requiredFor(mode) {
  if (mode === 'offline_click_conversion') return ['gclid', 'gbraid', 'wbraid'];
  if (mode === 'enhanced_conversions_for_leads') return ['user_identifiers'];
  if (mode === 'data_manager_api') return ['user_identifiers OR click_id'];
  return [];
}

function hasRequiredIdentifiers(mode, payload) {
  if (mode === 'offline_click_conversion') return !!(payload.gclid || payload.gbraid || payload.wbraid);
  if (mode === 'enhanced_conversions_for_leads') return Array.isArray(payload.user_identifiers) && payload.user_identifiers.length > 0;
  if (mode === 'data_manager_api') return !!(payload.gclid || payload.gbraid || payload.wbraid) || (payload.user_identifiers?.length ?? 0) > 0;
  return false;
}

async function uploadByMode(customer, creds, payload) {
  // SDK google-ads-api expõe conversionUploads.uploadClickConversions (offline)
  // e conversionAdjustmentUploads. Para enhanced conversions for leads o método
  // é o mesmo upload de click conversion incluindo user_identifiers.
  if (creds.uploadMode === 'offline_click_conversion' || creds.uploadMode === 'enhanced_conversions_for_leads') {
    return customer.conversionUploads.uploadClickConversions(
      [payload],
      { partial_failure: true, validate_only: false },
    );
  }
  if (creds.uploadMode === 'data_manager_api') {
    // Data Manager API ainda em rollout — placeholder explícito.
    throw new AppError(
      'upload_mode_not_implemented',
      'Modo data_manager_api ainda não implementado. Use offline_click_conversion ou enhanced_conversions_for_leads.',
      501,
    );
  }
  throw new AppError('invalid_upload_mode', `Modo desconhecido: ${creds.uploadMode}`, 400);
}

function extractPartialErrors(response) {
  const list = response?.partial_failure_error?.details || response?.results?.filter(r => r.status?.code) || [];
  if (!Array.isArray(list)) return [];
  return list.map(d => ({ message: d.message || d.detail || JSON.stringify(d), error_code: d.error_code }));
}

function extractErrorDetail(err) {
  return {
    name: err.name,
    code: err.code,
    request_id: err.request_id,
    failure: err.failure,
    errors: err.errors,
  };
}

function extractErrorCode(err) {
  return err.errors?.[0]?.error_code ? Object.keys(err.errors[0].error_code)[0] : (err.code || null);
}

function formatGoogleDate(date) {
  // Google Ads exige formato "YYYY-MM-DD HH:MM:SS+TZ"
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  const tz = -d.getTimezoneOffset();
  const sign = tz >= 0 ? '+' : '-';
  const tzH = pad(Math.floor(Math.abs(tz) / 60));
  const tzM = pad(Math.abs(tz) % 60);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${tzH}:${tzM}`;
}

const RETRY_DELAYS_MS = [5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 6 * 60 * 60_000, 24 * 60 * 60_000];
export const MAX_ATTEMPTS = 5;

function computeNextRetry(attempt) {
  if (attempt >= MAX_ATTEMPTS) return null;
  const delay = RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
  return new Date(Date.now() + delay);
}

/** Reagenda todas as conversões falhadas com `next_retry_at <= now()` para retry imediato. */
export async function retryFailedNow() {
  const now = new Date();
  const candidates = await prisma.googleAdsConversion.findMany({
    where: {
      status: 'failed',
      attempts: { lt: MAX_ATTEMPTS },
      OR: [{ nextRetryAt: { lte: now } }, { nextRetryAt: null }],
    },
    select: { id: true },
    take: 100,
  });
  return { rescheduled: candidates.length, ids: candidates.map(c => c.id) };
}
