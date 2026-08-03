import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import rateLimit from 'express-rate-limit';

import { logger } from './config/logger.js';
import { errorHandler, notFound } from './middleware/error.js';
import googleAdsRoutes from './routes/google-ads.routes.js';
import trackingRoutes from './routes/tracking.routes.js';
import rcsRoutes from './modules/rcs/rcs.routes.js';
import emailRoutes from './modules/email/email.routes.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors());
  // Captura rawBody durante o parse para que webhooks possam validar HMAC
  app.use(express.json({
    limit: '512kb',
    verify: (req, _res, buf) => { if (buf?.length) req.rawBody = buf.toString('utf8'); },
  }));
  app.use(express.urlencoded({ extended: false, limit: '64kb' }));
  app.use(pinoHttp({ logger }));

  // Rate limit geral — defesa básica
  app.use('/api/', rateLimit({
    windowMs: 60_000,
    max: 240, // 4 req/s por IP em média
    standardHeaders: true,
    legacyHeaders: false,
  }));

  // Healthcheck (não exige auth)
  app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

  // Tracking — captura é pública (precisa rodar no momento do landing, sem JWT)
  app.use('/api/tracking', trackingRoutes);

  // Google Ads — todos exigem JWT (definido nas rotas)
  app.use('/api/google-ads', googleAdsRoutes);

  // RCS — todos exigem JWT exceto /webhook/:providerId (público)
  app.use('/api/rcs', rcsRoutes);

  // E-mail — todos exigem JWT exceto /webhook/:providerId (público)
  app.use('/api/email', emailRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
