import { captureTrackingMiddleware } from '../../src/middleware/capture.js';

function mockReq({ query = {}, body = {}, headers = {} } = {}) {
  return {
    query, body,
    originalUrl: '/landing?x=1',
    get(name) { return headers[name.toLowerCase()]; },
    headers,
    socket: { remoteAddress: '10.0.0.1' },
  };
}

describe('captureTrackingMiddleware', () => {
  test('extrai gclid + utm + valuetrack do query string', (done) => {
    const req = mockReq({
      query: {
        gclid: 'abc-123',
        utm_source: 'google',
        utm_medium: 'cpc',
        utm_campaign: 'cold_lookalike',
        campaign_id: '111',
        adgroup_id: '222',
        device: 'm',
      },
      headers: { 'user-agent': 'jest', referer: 'https://google.com' },
    });
    captureTrackingMiddleware(req, {}, () => {
      expect(req.capturedTracking.gclid).toBe('abc-123');
      expect(req.capturedTracking.utmSource).toBe('google');
      expect(req.capturedTracking.utmCampaign).toBe('cold_lookalike');
      expect(req.capturedTracking.campaignId).toBe('111');
      expect(req.capturedTracking.adgroupId).toBe('222');
      expect(req.capturedTracking.device).toBe('m');
      expect(req.capturedTracking.userAgent).toBe('jest');
      expect(req.capturedTracking.referrer).toBe('https://google.com');
      expect(req.capturedTracking.ipAddress).toBe('10.0.0.1');
      done();
    });
  });

  test('body sobrescreve query (front pode mandar valores corrigidos)', (done) => {
    const req = mockReq({ query: { gclid: 'old' }, body: { gclid: 'new' } });
    captureTrackingMiddleware(req, {}, () => {
      expect(req.capturedTracking.gclid).toBe('new');
      done();
    });
  });

  test('valores ausentes não aparecem no output', (done) => {
    const req = mockReq({ query: {} });
    captureTrackingMiddleware(req, {}, () => {
      expect(req.capturedTracking.gclid).toBeUndefined();
      expect(req.capturedTracking.utmSource).toBeUndefined();
      done();
    });
  });

  test('strings longas são truncadas em 512', (done) => {
    const huge = 'x'.repeat(2000);
    const req = mockReq({ query: { utm_campaign: huge } });
    captureTrackingMiddleware(req, {}, () => {
      expect(req.capturedTracking.utmCampaign.length).toBe(512);
      done();
    });
  });

  test('captura X-Forwarded-For (primeiro IP da chain)', (done) => {
    const req = mockReq({ headers: { 'x-forwarded-for': '203.0.113.1, 198.51.100.2' } });
    captureTrackingMiddleware(req, {}, () => {
      expect(req.capturedTracking.ipAddress).toBe('203.0.113.1');
      done();
    });
  });
});
