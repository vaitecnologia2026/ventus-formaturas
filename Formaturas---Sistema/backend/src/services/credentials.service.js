import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/error.js';

/**
 * Credenciais ficam no banco (linha singleton id=1). Fallback para variáveis
 * de ambiente quando o banco ainda não tem nada — útil pro primeiro setup
 * sem rodar a tela de configuração.
 *
 * Nunca retornamos `clientSecret`/`developerToken`/`refreshToken` em respostas
 * HTTP — o controller é quem decide o que serializar.
 */

const ENV_FALLBACK = {
  customerId:           env.GOOGLE_ADS_CUSTOMER_ID,
  loginCustomerId:      env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
  developerToken:       env.GOOGLE_ADS_DEVELOPER_TOKEN,
  clientId:             env.GOOGLE_ADS_CLIENT_ID,
  clientSecret:         env.GOOGLE_ADS_CLIENT_SECRET,
  refreshToken:         env.GOOGLE_ADS_REFRESH_TOKEN,
  conversionActionId:   env.GOOGLE_ADS_CONVERSION_ACTION_ID,
  conversionActionName: env.GOOGLE_ADS_CONVERSION_ACTION_NAME,
  defaultCurrency:      env.GOOGLE_ADS_DEFAULT_CURRENCY,
  uploadMode:           env.GOOGLE_ADS_UPLOAD_MODE,
  eventActionMap:       null,
};

const REQUIRED = ['customerId', 'developerToken', 'clientId', 'clientSecret', 'refreshToken'];

export async function getCredentials() {
  const row = await prisma.googleAdsCredential.findUnique({ where: { id: 1 } });
  if (row) return row;
  // Sem linha no banco — devolve fallback do .env (pode ser vazio)
  return ENV_FALLBACK;
}

export async function getCredentialsOrThrow() {
  const c = await getCredentials();
  const missing = REQUIRED.filter(k => !c[k]);
  if (missing.length) {
    throw new AppError(
      'google_ads_credentials_missing',
      `Credenciais Google Ads ausentes: ${missing.join(', ')}. Configure em POST /api/google-ads/config ou via .env.`,
      503,
      { missing },
    );
  }
  return c;
}

export async function upsertCredentials(input) {
  const data = { ...input, id: 1 };
  return prisma.googleAdsCredential.upsert({
    where: { id: 1 },
    create: data,
    update: input,
  });
}

/** Resolve o conversion_action_id para um evento — usa o mapa por evento se houver, senão o padrão. */
export function resolveConversionActionId(creds, event) {
  const mapped = creds.eventActionMap?.[event];
  return mapped || creds.conversionActionId;
}

/** Sanitiza para serialização HTTP — remove segredos. */
export function publicView(c) {
  if (!c) return null;
  return {
    customerId: c.customerId || null,
    loginCustomerId: c.loginCustomerId || null,
    developerTokenSet: !!c.developerToken,
    clientIdSet: !!c.clientId,
    clientSecretSet: !!c.clientSecret,
    refreshTokenSet: !!c.refreshToken,
    conversionActionId: c.conversionActionId || null,
    conversionActionName: c.conversionActionName || null,
    defaultCurrency: c.defaultCurrency || null,
    uploadMode: c.uploadMode || null,
    eventActionMap: c.eventActionMap || null,
  };
}
