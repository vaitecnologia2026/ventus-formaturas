/**
 * Worker de retry — usa pg-boss (Postgres como fila, sem Redis).
 *
 * Estratégia:
 *   - Job recorrente a cada 60s ("scan-failed-conversions") busca conversões
 *     com status `failed` e `next_retry_at <= now()`, e enfileira um job
 *     individual `process-conversion` por id.
 *   - Job `process-conversion` chama o service para tentar enviar; se falhar
 *     novamente, o service já recalcula `next_retry_at` (5min/30min/2h/6h/24h
 *     até o máximo de 5 tentativas).
 *
 * Rode com: `npm run worker`
 */
import PgBoss from 'pg-boss';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { prisma } from '../db/prisma.js';
import { processConversion, MAX_ATTEMPTS } from '../services/google-ads.service.js';
import { processMessage as processRcsMessage, MAX_RCS_ATTEMPTS } from '../modules/rcs/rcs.service.js';
import { processMessage as processEmailMessage, MAX_EMAIL_ATTEMPTS } from '../modules/email/email.service.js';

const QUEUE_PROCESS = 'process-conversion';
const QUEUE_SCAN = 'scan-failed-conversions';
const QUEUE_RCS_PROCESS = 'process-rcs-message';
const QUEUE_RCS_SCAN = 'scan-failed-rcs-messages';
const QUEUE_EMAIL_PROCESS = 'process-email-message';
const QUEUE_EMAIL_SCAN = 'scan-failed-email-messages';
const SCAN_EVERY_SEC = 60;

async function main() {
  const boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    schema: env.PGBOSS_SCHEMA,
    retryLimit: 0,           // o controle de retry é nosso, não do pg-boss
    retentionDays: 7,
    monitorStateIntervalSeconds: 30,
  });

  boss.on('error', (err) => logger.error({ err }, 'pgboss_error'));
  await boss.start();
  logger.info({ queue: QUEUE_PROCESS }, 'worker_started');

  // Handler que processa uma conversão por vez (concurrency baixa para não estourar o rate limit do Google)
  await boss.work(QUEUE_PROCESS, { teamSize: 4, teamConcurrency: 1 }, async (job) => {
    const { conversionId } = job.data;
    logger.info({ conversionId }, 'processing_conversion');
    const result = await processConversion(conversionId);
    return { status: result.status, attempts: result.attempts };
  });

  // Job recorrente: varre as failed prontas para retry e enfileira
  await boss.work(QUEUE_SCAN, async () => {
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
    for (const c of candidates) {
      await boss.send(QUEUE_PROCESS, { conversionId: c.id }, { singletonKey: c.id });
    }
    if (candidates.length) logger.info({ count: candidates.length }, 'rescheduled_failed_conversions');
  });

  await boss.schedule(QUEUE_SCAN, `*/${SCAN_EVERY_SEC} * * * * *`);

  // ========== RCS retry ==========
  await boss.work(QUEUE_RCS_PROCESS, { teamSize: 8, teamConcurrency: 2 }, async (job) => {
    const { messageId } = job.data;
    logger.info({ messageId }, 'processing_rcs_message');
    const result = await processRcsMessage(messageId);
    return { status: result.status, attempts: result.attempts };
  });

  await boss.work(QUEUE_RCS_SCAN, async () => {
    const now = new Date();
    const candidates = await prisma.rcsMessage.findMany({
      where: {
        status: 'failed',
        attempts: { lt: MAX_RCS_ATTEMPTS },
        nextRetryAt: { lte: now, not: null },
      },
      select: { id: true },
      take: 100,
    });
    for (const m of candidates) {
      await boss.send(QUEUE_RCS_PROCESS, { messageId: m.id }, { singletonKey: m.id });
    }
    if (candidates.length) logger.info({ count: candidates.length }, 'rescheduled_failed_rcs_messages');
  });

  await boss.schedule(QUEUE_RCS_SCAN, `*/${SCAN_EVERY_SEC} * * * * *`);

  // ========== E-mail retry ==========
  await boss.work(QUEUE_EMAIL_PROCESS, { teamSize: 8, teamConcurrency: 2 }, async (job) => {
    const { messageId } = job.data;
    logger.info({ messageId }, 'processing_email_message');
    const result = await processEmailMessage(messageId);
    return { status: result.status };
  });

  await boss.work(QUEUE_EMAIL_SCAN, async () => {
    const now = new Date();
    const candidates = await prisma.emailMessage.findMany({
      where: {
        status: 'failed',
        attempts: { lt: MAX_EMAIL_ATTEMPTS },
        nextRetryAt: { lte: now, not: null },
      },
      select: { id: true },
      take: 100,
    });
    for (const m of candidates) {
      await boss.send(QUEUE_EMAIL_PROCESS, { messageId: m.id }, { singletonKey: m.id });
    }
    if (candidates.length) logger.info({ count: candidates.length }, 'rescheduled_failed_email_messages');
  });

  await boss.schedule(QUEUE_EMAIL_SCAN, `*/${SCAN_EVERY_SEC} * * * * *`);

  async function shutdown(signal) {
    logger.info({ signal }, 'worker_shutdown');
    await boss.stop({ graceful: true, timeout: 10_000 });
    await prisma.$disconnect();
    process.exit(0);
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'worker_failed_to_start');
  process.exit(1);
});
