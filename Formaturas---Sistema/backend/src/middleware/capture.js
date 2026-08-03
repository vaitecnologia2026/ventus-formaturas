/**
 * Captura de tracking — extrai click IDs, UTMs e ValueTrack tanto do query string
 * (no momento do landing) quanto do body (quando o front envia explicitamente
 * em POST /api/tracking/capture).
 *
 * Não persiste — apenas normaliza e expõe em req.capturedTracking.
 * O service grava no banco.
 */

const TRACKING_KEYS = [
  'gclid', 'gbraid', 'wbraid',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'campaign_id', 'adgroup_id', 'creative', 'keyword', 'matchtype', 'device', 'placement',
];

const camel = (k) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

export function captureTrackingMiddleware(req, _res, next) {
  const src = { ...(req.query || {}), ...(req.body || {}) };
  const captured = {};
  for (const key of TRACKING_KEYS) {
    const v = src[key];
    if (v != null && String(v).trim() !== '') {
      captured[camel(key)] = String(v).trim().slice(0, 512);
    }
  }
  // Contexto da requisição
  captured.landingPage = src.landing_page || src.landingPage || req.originalUrl;
  captured.referrer    = req.get('referer') || src.referrer || null;
  captured.userAgent   = req.get('user-agent') || null;
  captured.ipAddress   = (req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || '').trim() || null;
  req.capturedTracking = captured;
  next();
}
