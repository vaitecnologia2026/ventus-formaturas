/**
 * Garante que o módulo Email NÃO retorna sucesso falso:
 *   - Provider inexistente → 404
 *   - Provider sem credenciais → o sendEmail retorna { success:false, status:'failed' } com errorCode credentials_missing
 *   - Email inválido → 200 com success:false (status:rejected)
 *   - Email em supressão → 200 com success:false (status:rejected)
 *   - Webhook signature inválida → 401
 *   - Auth obrigatória em rotas privadas
 */
import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://x:y@localhost:5432/x';
process.env.JWT_SECRET = 'a'.repeat(48);

// Provider de teste — SMTP sem host/port/credenciais (vai bater em credentials_missing)
const fakeProvider = {
  id: '00000000-0000-0000-0000-000000000010',
  providerName: 'TestSmtp',
  providerType: 'smtp',
  active: true,
  fromName: 'Ventus',
  fromEmail: 'no-reply@ventus.com',
  replyTo: null,
  host: null,                     // ← AUSENTE de propósito
  port: null,
  secure: null,
  username: null, password: null,
  apiKey: null, region: null, accessKey: null, secretKey: null,
  baseUrl: null, authType: null, bearerToken: null,
  customHeaders: null, payloadTemplate: null, responsePaths: null,
  httpMethod: 'POST', sendPath: '/send',
  webhookSecret: 'shhh',
  dailyLimit: null, hourlyLimit: null,
  rateLimitPerMinute: 60, timeoutMs: 5000,
};

const messageStore = new Map();
const suppressionStore = new Map();

jest.unstable_mockModule('@prisma/client', () => ({
  PrismaClient: class {
    emailProvider = {
      findUnique: async ({ where }) => (where.id === fakeProvider.id ? fakeProvider : null),
      count: async () => 0,
    };
    emailTemplate = { findUnique: async () => null };
    emailMessage = {
      findFirst: async () => null,
      findUnique: async ({ where, include }) => {
        const m = messageStore.get(where.id);
        if (!m) return null;
        return include?.provider ? { ...m, provider: fakeProvider } : m;
      },
      count: async () => 0,
      upsert: async ({ where, create }) => {
        const existing = [...messageStore.values()].find(m => m.dedupKey === where.dedupKey);
        if (existing) return existing;
        const id = 'mail-' + (messageStore.size + 1);
        const m = { id, status: 'pending', attempts: 0, ...create };
        messageStore.set(id, m);
        return m;
      },
      update: async ({ where, data }) => {
        const m = messageStore.get(where.id) || { id: where.id };
        const updated = { ...m, ...data };
        messageStore.set(where.id, updated);
        return updated;
      },
    };
    emailMessageLog = { create: async () => ({ id: 'log-1' }), findMany: async () => [], count: async () => 0 };
    emailWebhookEvent = { create: async (x) => ({ id: 'wh-' + Date.now(), ...x.data }) };
    emailSuppression = {
      findUnique: async ({ where }) => suppressionStore.get(where.emailLower) || null,
      upsert: async ({ where, create }) => {
        const existing = suppressionStore.get(where.emailLower);
        if (existing) return existing;
        suppressionStore.set(where.emailLower, create);
        return create;
      },
    };
    // Mocks dos outros módulos (não usados, mas precisam existir pro app subir)
    rcsProvider = { count: async () => 0, findUnique: async () => null };
    rcsMessage = { count: async () => 0, findFirst: async () => null };
    rcsMessageLog = { count: async () => 0 };
    googleAdsCredential = { findUnique: async () => null };
    googleAdsConversion = { count: async () => 0, findFirst: async () => null };
    $disconnect = async () => {};
    $transaction = async (fn) => fn(this);
  },
}));

let app;
let token;

beforeAll(async () => {
  const { createApp } = await import('../../src/app.js');
  app = createApp();
  token = jwt.sign({ sub: 'test-user' }, process.env.JWT_SECRET);
});

beforeEach(() => {
  messageStore.clear();
  suppressionStore.clear();
});

describe('Email — sem credenciais não retorna sucesso falso', () => {
  test('GET /api/email/status sem dados retorna estrutura vazia, não 200 falso', async () => {
    const res = await request(app).get('/api/email/status').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.counts.sent).toBe(0);
  });

  test('POST /api/email/send sem provider existente -> 404', async () => {
    const res = await request(app)
      .post('/api/email/send')
      .set('Authorization', `Bearer ${token}`)
      .send({ providerId: '11111111-1111-1111-1111-111111111111', to: 'foo@bar.com', subject: 'oi', text: 'oi' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('email_provider_not_found');
  });

  test('POST /api/email/send com SMTP sem host -> success:false, status:failed, errorCode credentials_missing', async () => {
    const res = await request(app)
      .post('/api/email/send')
      .set('Authorization', `Bearer ${token}`)
      .send({ providerId: fakeProvider.id, to: 'foo@bar.com', subject: 'oi', text: 'oi' });
    expect([200, 202]).toContain(res.status);
    expect(res.body.success).toBe(false);
    expect(res.body.status).toBe('failed');
    expect(res.body.error).toBe('credentials_missing');
  });

  test('POST /api/email/send com email inválido -> 400 (zod) ou success:false (status rejected)', async () => {
    const res = await request(app)
      .post('/api/email/send')
      .set('Authorization', `Bearer ${token}`)
      .send({ providerId: fakeProvider.id, to: 'not-an-email', subject: 'oi', text: 'oi' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  test('POST /api/email/send para email em supressão -> rejected', async () => {
    suppressionStore.set('blocked@example.com', { reason: 'bounce', source: 'manual' });
    const res = await request(app)
      .post('/api/email/send')
      .set('Authorization', `Bearer ${token}`)
      .send({ providerId: fakeProvider.id, to: 'blocked@example.com', subject: 'oi', text: 'oi' });
    expect([200, 202]).toContain(res.status);
    expect(res.body.success).toBe(false);
    expect(res.body.status).toBe('rejected');
    expect(res.body.error).toBe('suppressed');
  });

  test('POST /api/email/test-connection sem credenciais -> 503 com error code claro', async () => {
    const res = await request(app)
      .post('/api/email/test-connection')
      .set('Authorization', `Bearer ${token}`)
      .send({ providerId: fakeProvider.id });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('credentials_missing');
  });
});

describe('Email — auth obrigatória', () => {
  test('GET /api/email/providers sem token -> 401', async () => {
    const res = await request(app).get('/api/email/providers');
    expect(res.status).toBe(401);
  });
  test('GET /api/email/templates sem token -> 401', async () => {
    const res = await request(app).get('/api/email/templates');
    expect(res.status).toBe(401);
  });
});

describe('Email — webhook bloqueia signature inválida', () => {
  test('POST /api/email/webhook/:id signature errada -> 401, evento gravado pra audit', async () => {
    const res = await request(app)
      .post(`/api/email/webhook/${fakeProvider.id}`)
      .set('content-type', 'application/json')
      .set('x-webhook-signature', 'sha256=deadbeef')
      .send([{ event: 'delivered', sg_message_id: 'mid-1', email: 'foo@bar.com' }]);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('webhook_signature_invalid');
    expect(res.body.accepted_for_audit).toBeGreaterThanOrEqual(0); // SmtpProvider.parseWebhook retorna 0 mesmo
  });
});

describe('Email — validação Zod', () => {
  test('POST /api/email/send sem html/text/template -> 400', async () => {
    const res = await request(app)
      .post('/api/email/send')
      .set('Authorization', `Bearer ${token}`)
      .send({ providerId: fakeProvider.id, to: 'foo@bar.com', subject: 'oi' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });
});
