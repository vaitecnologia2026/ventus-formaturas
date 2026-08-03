/**
 * Garante que SEM credenciais o backend retorna erro estruturado, não 200 fake.
 *
 * Esse é o teste que prova o requisito "sem mocked success em produção".
 *
 * Mockamos o módulo `@prisma/client` para evitar dependência de Postgres real.
 * NÃO mockamos a service de credentials nem o google-ads.service — eles devem
 * naturalmente lançar `google_ads_credentials_missing` e o controller deve
 * traduzir em HTTP 503.
 */
import { jest, describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// Garantir variáveis mínimas pro app subir, SEM credenciais Google Ads
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://x:y@localhost:5432/x';
process.env.JWT_SECRET = 'a'.repeat(48);
delete process.env.GOOGLE_ADS_CUSTOMER_ID;
delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
delete process.env.GOOGLE_ADS_CLIENT_ID;
delete process.env.GOOGLE_ADS_CLIENT_SECRET;
delete process.env.GOOGLE_ADS_REFRESH_TOKEN;

// Mock Prisma — googleAdsCredential.findUnique devolve null (sem linha no banco)
jest.unstable_mockModule('@prisma/client', () => ({
  PrismaClient: class {
    googleAdsCredential = { findUnique: async () => null };
    googleAdsConversion = { count: async () => 0, findFirst: async () => null };
    $disconnect = async () => {};
  },
}));

let app;
let token;

beforeAll(async () => {
  const { createApp } = await import('../../src/app.js');
  app = createApp();
  token = jwt.sign({ sub: 'test-user' }, process.env.JWT_SECRET);
});

afterAll(async () => {
  // nada a fechar — Prisma mockado
});

describe('Sem credenciais — não pode retornar sucesso falso', () => {
  test('GET /api/google-ads/status retorna credentialsConfigured=false (sem mentir que está OK)', async () => {
    const res = await request(app)
      .get('/api/google-ads/status')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.credentialsConfigured).toBe(false);
  });

  test('POST /api/google-ads/test-connection retorna 503 com error code claro', async () => {
    const res = await request(app)
      .post('/api/google-ads/test-connection')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('google_ads_credentials_missing');
    expect(res.body.detail.missing).toContain('customerId');
  });

  test('POST /api/google-ads/upload-conversion retorna 503 (não 200 falso)', async () => {
    const res = await request(app)
      .post('/api/google-ads/upload-conversion')
      .set('Authorization', `Bearer ${token}`)
      .send({ leadId: 'l-1', conversionEvent: 'lead_created' });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('google_ads_credentials_missing');
  });
});

describe('Auth obrigatório', () => {
  test('GET /api/google-ads/status sem token -> 401', async () => {
    const res = await request(app).get('/api/google-ads/status');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('missing_or_invalid_authorization_header');
  });
  test('Token inválido -> 401', async () => {
    const res = await request(app)
      .get('/api/google-ads/status')
      .set('Authorization', 'Bearer not-a-real-jwt');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_token');
  });
});
