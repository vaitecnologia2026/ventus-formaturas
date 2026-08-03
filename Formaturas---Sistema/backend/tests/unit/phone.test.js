import { normalizePhone, isValidPhone } from '../../src/utils/phone.js';

describe('normalizePhone — Brasil', () => {
  test('aceita celular BR com formatação', () => {
    const r = normalizePhone('(38) 99876-5432');
    expect(r.ok).toBe(true);
    expect(r.normalized).toBe('+5538998765432');
    expect(r.country).toBe('BR');
  });
  test('aceita celular BR só com dígitos', () => {
    const r = normalizePhone('38998765432');
    expect(r.ok).toBe(true);
    expect(r.normalized).toBe('+5538998765432');
  });
  test('aceita com DDI 55 sem +', () => {
    const r = normalizePhone('5538998765432');
    expect(r.ok).toBe(true);
    expect(r.normalized).toBe('+5538998765432');
  });
  test('aceita já em E.164', () => {
    const r = normalizePhone('+5538998765432');
    expect(r.ok).toBe(true);
    expect(r.normalized).toBe('+5538998765432');
  });
});

describe('normalizePhone — outros países', () => {
  test('aceita US com country override', () => {
    const r = normalizePhone('212-555-1234', 'US');
    expect(r.ok).toBe(true);
    expect(r.normalized).toBe('+12125551234');
    expect(r.country).toBe('US');
  });
  test('aceita E.164 internacional sem country', () => {
    const r = normalizePhone('+44 20 7946 0958');
    expect(r.ok).toBe(true);
    expect(r.normalized).toBe('+442079460958');
  });
});

describe('normalizePhone — inválidos', () => {
  test('rejeita string vazia', () => {
    const r = normalizePhone('');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('phone_empty');
  });
  test('rejeita só letras', () => {
    const r = normalizePhone('abc');
    expect(r.ok).toBe(false);
  });
  test('rejeita número curto demais', () => {
    const r = normalizePhone('123');
    expect(r.ok).toBe(false);
  });
  test('preserva original', () => {
    const r = normalizePhone('(38) 99876-5432  ');
    expect(r.original).toBe('(38) 99876-5432');
  });
});

describe('isValidPhone', () => {
  test('true para BR válido', () => {
    expect(isValidPhone('38998765432', 'BR')).toBe(true);
  });
  test('false para inválido', () => {
    expect(isValidPhone('abc', 'BR')).toBe(false);
  });
});
