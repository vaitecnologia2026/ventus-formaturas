import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { disconnect } from './db/prisma.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'http_server_started');
});

async function shutdown(signal) {
  logger.info({ signal }, 'shutdown_initiated');
  server.close(async () => {
    await disconnect();
    process.exit(0);
  });
  // hard timeout
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => logger.error({ reason }, 'unhandled_rejection'));
