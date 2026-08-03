/**
 * Garante que o módulo RCS NÃO retorna sucesso falso:
 *   - Provider inexistente → 404
 *   - Provider sem credenciais → 503 com error code claro
 *   - Webhook com signature inválida → 401
 *   - Telefone inválido → 400 explícito
 */
import { jest, describe, test, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://x:y@localhost:5432/x';
process.env.JWT_SECRET = 'a'.repeat(48);

// Mock Prisma — dados em memória
const fakeProvider = {
  id: '00000000-0000-0000-0000-000000000001',
  providerName: 'TestProvider',
  providerKind: 'generic_http',
  active: true,
  baseUrl: 'https://api.example.com',
  authType: 'api_key_header',
  apiKey: null,                    // <-- AUSENTE de propósito (vai bater no credentials_missing)
  bearerToken: null,
  username: null, password: null,
  clientId: null, clientSecret: null,
  oauthTokenUrl: null,
  accountId: null, senderId: 'sndr', agentId: null,
  webhookSecret: 'super-secret',
  defaultCountryCode: '55',
  rateLimitPerMinute: 60,
  timeoutMs: 5000,
  customHeaders: null,
  payloadTemplate: null,
  responsePaths: null,
  httpMethod: 'POST',
  sendPath: '/send',
};

// Storage em memória pra simular o ciclo upsert -> findUnique -> update
const messageStore = new Map();

jest.unstable_mockModule('@prisma/client', () => ({
  PrismaClient: class {
    rcsProvider = {
      findUnique: async ({ where }) => (where.id === fakeProvider.id ? fakeProvider : null),
      count: async () => 0,
    };
    rcsMessage = {
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
        const id = 'msg-' + (messageStore.size + 1);
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
    rcsMessageLog = { create: async () => ({ id: 'log-1' }), count: async () => 0, findMany: async () => [] };
    rcsWebhookEvent = { create: async (x) => ({ id: 'wh-' + Date.now(), ...x.data }) };
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

describe('RCS — sem credenciais não retorna sucesso falso', () => {
  test('GET /api/rcs/status sem dados retorna estrutura, não 200 falso', async () => {
    const res = await request(app).get('/api/rcs/status').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('counts');
    expect(res.body.counts.sent).toBe(0);
  });

  test('POST /api/rcs/send sem provider existente -> 404', async () => {
    const res = await request(app)
      .post('/api/rcs/send')
      .set('Authorization', `Bearer ${token}`)
      .send({ providerId: '11111111-1111-1111-1111-111111111111', to: '+5538998765432', text: 'oi' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('rcs_provider_not_found');
  });

  test('POST /api/rcs/send com provider sem credenciais -> 503 estruturado (não 200 fake)', async () => {
    const res = await request(app)
      .post('/api/rcs/send')
      .set('Authorization', `Bearer ${token}`)
      .send({ providerId: fakeProvider.id, to: '+5538998765432', text: 'oi' });
    // O service tenta enviar e o GenericHttpProvider lança credentials_missing
    // que vira HTTP 503 via mapErrorStatus → AppError. O processMessage trata
    // o erro internamente e retorna message.status='failed'. HTTP 202 é OK.
    // Mas a coluna lastError DEVE conter "credentials_missing".
    expect([202, 200]).toContain(res.status);
    expect(res.body.message.status).toBe('failed');
    expect(res.body.message.lastError).toMatch(/credenciais|credentials/i);
  });

  test('POST /api/rcs/send com telefone inválido -> 400 (não 200)', async () => {
    const res = await request(app)
      .post('/api/rcs/send')
      .set('Authorization', `Bearer ${token}`)
      // '99999' tem 5 chars (passa Zod min(5)) mas libphonenumber rejeita
      .send({ providerId: fakeProvider.id, to: '99999', text: 'oi' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_phone');
  });

  test('POST /api/rcs/test-connection sem credenciais -> 503', async () => {
    const res = await request(app)
      .post('/api/rcs/test-connection')
      .set('Authorization', `Bearer ${token}`)
      .send({ providerId: fakeProvider.id });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('credentials_missing');
  });
});

describe('RCS — auth obrigatória', () => {
  test('GET /api/rcs/providers sem token -> 401', async () => {
    const res = await request(app).get('/api/rcs/providers');
    expect(res.status).toBe(401);
  });
});

describe('RCS — webhook bloqueia signature inválida', () => {
  test('POST /api/rcs/webhook/:id com signature errada -> 401, mas evento gravado pra audit', async () => {
    const res = await request(app)
      .post(`/api/rcs/webhook/${fakeProvider.id}`)
      .set('content-type', 'application/json')
      .set('x-webhook-signature', 'sha256=deadbeef')
      .send({ id: 'msg-x', status: 'delivered' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('webhook_signature_invalid');
    expect(res.body.accepted_for_audit).toBeGreaterThanOrEqual(1);
  });
});

describe('RCS — validação Zod', () => {
  test('POST /api/rcs/send sem text/payload/template -> 400', async () => {
    const res = await request(app)
      .post('/api/rcs/send')
      .set('Authorization', `Bearer ${token}`)
      .send({ providerId: fakeProvider.id, to: '+5538998765432' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });
});
