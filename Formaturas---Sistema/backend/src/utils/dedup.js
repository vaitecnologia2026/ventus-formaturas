import crypto from 'crypto';

/**
 * Chave determinística para garantir que a mesma conversão não suba duas vezes.
 * Combina: lead_id (ou order_id) + conversion_event + conversion_action_id + conversion_date (yyyy-mm-dd UTC).
 *
 * SHA-256 da concatenação. Armazenada na coluna unique `dedup_key` — UPSERT em vez de
 * checagem prévia race-prone.
 */
export function buildDedupKey({ leadId, orderId, conversionEvent, conversionActionId, conversionTime }) {
  const idPart = (leadId || orderId || '').trim();
  if (!idPart) throw new Error('dedup_key requires leadId or orderId');
  if (!conversionEvent) throw new Error('dedup_key requires conversionEvent');
  if (!conversionActionId) throw new Error('dedup_key requires conversionActionId');
  const date = new Date(conversionTime);
  if (Number.isNaN(date.getTime())) throw new Error('dedup_key requires valid conversionTime');
  const dayUtc = date.toISOString().slice(0, 10); // yyyy-mm-dd
  const raw = [idPart, conversionEvent, conversionActionId, dayUtc].join('|');
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}
