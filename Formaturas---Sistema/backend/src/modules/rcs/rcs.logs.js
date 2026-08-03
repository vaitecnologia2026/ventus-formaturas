import { prisma } from '../../db/prisma.js';

/**
 * Cria uma linha em rcs_message_logs.
 *
 * Não silencia erros — se o log falhar, propaga (provavelmente DB caiu, problema maior).
 * O caller decide se quer try/catch.
 */
export async function writeMessageLog({
  messageId, attempt, status, providerName,
  rawRequest = null, rawResponse = null,
  httpStatus = null, errorMessage = null, errorCode = null,
  durationMs = null,
}) {
  return prisma.rcsMessageLog.create({
    data: {
      messageId, attempt, status, providerName,
      rawRequest, rawResponse, httpStatus, errorMessage, errorCode, durationMs,
    },
  });
}

export async function listLogs({ messageId, page = 1, pageSize = 50 }) {
  const where = messageId ? { messageId } : {};
  const [items, total] = await Promise.all([
    prisma.rcsMessageLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.rcsMessageLog.count({ where }),
  ]);
  return { page, pageSize, total, items };
}
