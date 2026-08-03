import {
  normalizeEmail,
  normalizePhone,
  normalizeName,
  normalizeRegion,
  normalizeCountry,
  normalizePostalCode,
  sha256,
  hashUserIdentifiers,
} from '../../src/utils/crypto.js';

describe('normalize', () => {
  test('email: trim + lowercase', () => {
    expect(normalizeEmail('  Foo@Bar.com  ')).toBe('foo@bar.com');
  });
  test('email vazio -> undefined', () => {
    expect(normalizeEmail('')).toBeUndefined();
    expect(normalizeEmail(null)).toBeUndefined();
  });
  test('phone BR sem DDI -> +55', () => {
    expect(normalizePhone('(38) 99863-1234')).toBe('+5538998631234');
  });
  test('phone com 55 mas sem + -> prepende +', () => {
    expect(normalizePhone('5538998631234')).toBe('+5538998631234');
  });
  test('phone já com + -> mantém', () => {
    expect(normalizePhone('+15551234567')).toBe('+15551234567');
  });
  test('nome: trim + lowercase + sem diacrítico + colapsa espaço', () => {
    expect(normalizeName('  João  da   Silva  ')).toBe('joao da silva');
  });
  test('country -> ISO alpha-2 minúsculo', () => {
    expect(normalizeCountry('BRA')).toBe('br');
    expect(normalizeCountry('us')).toBe('us');
  });
  test('postal -> só dígitos', () => {
    expect(normalizePostalCode('39400-000')).toBe('39400000');
  });
});

describe('sha256', () => {
  test('hash determinístico para vetor conhecido', () => {
    // Vetor verificado: SHA-256("user@example.com")
    expect(sha256('user@example.com')).toBe('b4c9a289323b21a01c3e940f150eb9b8c542587f1abfd8f0e1cc1ffc5e475514');
  });
  test('hash igual ao normalizar email cru', () => {
    expect(sha256(normalizeEmail(' USER@example.com '))).toBe(sha256('user@example.com'));
  });
  test('vazio -> undefined', () => {
    expect(sha256('')).toBeUndefined();
    expect(sha256(null)).toBeUndefined();
  });
});

describe('hashUserIdentifiers', () => {
  test('hasheia email/phone/nome e mantém endereço em texto', () => {
    const out = hashUserIdentifiers({
      email: 'João@Ventus.COM',
      phone: '38998631234',
      firstName: 'João',
      lastName: 'Silva',
      city: 'Montes Claros',
      state: 'MG',
      country: 'BR',
      postalCode: '39400-000',
    });
    expect(out.hashedEmail).toMatch(/^[a-f0-9]{64}$/);
    expect(out.hashedPhoneNumber).toMatch(/^[a-f0-9]{64}$/);
    expect(out.hashedFirstName).toMatch(/^[a-f0-9]{64}$/);
    expect(out.hashedLastName).toMatch(/^[a-f0-9]{64}$/);
    expect(out.city).toBe('montes claros');
    expect(out.countryCode).toBe('br');
    expect(out.postalCode).toBe('39400000');
  });
  test('campos vazios não aparecem no output', () => {
    const out = hashUserIdentifiers({ email: 'a@b.com' });
    expect(out.hashedEmail).toBeDefined();
    expect(out.hashedPhoneNumber).toBeUndefined();
    expect(out.hashedFirstName).toBeUndefined();
    expect(out.city).toBeUndefined();
  });
});
