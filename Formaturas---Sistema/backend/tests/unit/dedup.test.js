import { buildDedupKey } from '../../src/utils/dedup.js';

describe('buildDedupKey', () => {
  const base = {
    leadId: 'lead-123',
    conversionEvent: 'lead_created',
    conversionActionId: '987654321',
    conversionTime: '2026-05-02T10:30:00.000Z',
  };

  test('mesma entrada -> mesma chave (idempotente)', () => {
    expect(buildDedupKey(base)).toBe(buildDedupKey(base));
  });

  test('hora diferente no mesmo dia UTC -> mesma chave', () => {
    expect(buildDedupKey(base)).toBe(buildDedupKey({ ...base, conversionTime: '2026-05-02T22:59:00.000Z' }));
  });

  test('dia diferente UTC -> chave diferente', () => {
    expect(buildDedupKey(base)).not.toBe(buildDedupKey({ ...base, conversionTime: '2026-05-03T00:00:00.000Z' }));
  });

  test('evento diferente -> chave diferente', () => {
    expect(buildDedupKey(base)).not.toBe(buildDedupKey({ ...base, conversionEvent: 'sale_completed' }));
  });

  test('action_id diferente -> chave diferente', () => {
    expect(buildDedupKey(base)).not.toBe(buildDedupKey({ ...base, conversionActionId: '111111111' }));
  });

  test('orderId substitui leadId quando ausente', () => {
    const k1 = buildDedupKey({ ...base, leadId: undefined, orderId: 'ord-1' });
    expect(k1).toMatch(/^[a-f0-9]{64}$/);
    expect(k1).not.toBe(buildDedupKey(base));
  });

  test('lança se faltar id', () => {
    expect(() => buildDedupKey({ ...base, leadId: undefined })).toThrow(/leadId or orderId/);
  });

  test('lança se data inválida', () => {
    expect(() => buildDedupKey({ ...base, conversionTime: 'banana' })).toThrow(/valid conversionTime/);
  });
});
