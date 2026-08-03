import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().url().or(z.string().startsWith('postgresql://')),
  DB_SSL: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter pelo menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('12h'),

  // Credenciais Google Ads são opcionais no boot — viram obrigatórias só quando alguém tenta enviar conversão
  GOOGLE_ADS_CUSTOMER_ID: z.string().optional(),
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: z.string().optional(),
  GOOGLE_ADS_DEVELOPER_TOKEN: z.string().optional(),
  GOOGLE_ADS_CLIENT_ID: z.string().optional(),
  GOOGLE_ADS_CLIENT_SECRET: z.string().optional(),
  GOOGLE_ADS_REFRESH_TOKEN: z.string().optional(),
  GOOGLE_ADS_CONVERSION_ACTION_ID: z.string().optional(),
  GOOGLE_ADS_CONVERSION_ACTION_NAME: z.string().optional(),
  GOOGLE_ADS_DEFAULT_CURRENCY: z.string().length(3).default('BRL'),
  GOOGLE_ADS_UPLOAD_MODE: z.enum([
    'enhanced_conversions_for_leads',
    'offline_click_conversion',
    'data_manager_api',
  ]).default('offline_click_conversion'),

  PGBOSS_SCHEMA: z.string().default('pgboss'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // Use console.error here — logger ainda não foi inicializado
  console.error('❌ Configuração inválida:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
