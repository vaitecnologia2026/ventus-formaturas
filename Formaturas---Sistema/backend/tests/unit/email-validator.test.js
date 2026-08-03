import { isValidEmail, normalizeEmail } from '../../src/utils/email-validator.js';

describe('isValidEmail', () => {
  test.each([
    'user@example.com',
    'first.last+tag@sub.domain.com',
    'a@b.co',
    'admin@empresa.com.br',
  ])('aceita "%s"', (e) => expect(isValidEmail(e)).toBe(true));

  test.each([
    '',
    null,
    undefined,
    'not-an-email',
    '@nohead.com',
    'no@tail',
    'two@@example.com',
    'spaces in@example.com',
    'dotdot..local@example.com',
    'a'.repeat(65) + '@example.com',     // local > 64
    'a@' + 'b'.repeat(256) + '.com',      // domain > 255
  ])('rejeita "%s"', (e) => expect(isValidEmail(e)).toBe(false));
});

describe('normalizeEmail', () => {
  test('trim + lowercase domain + lowercase local (pra dedup/suppression)', () => {
    expect(normalizeEmail('  Foo.Bar@Example.COM  ')).toBe('foo.bar@example.com');
  });
  test('inválido vira null', () => {
    expect(normalizeEmail('not-an-email')).toBeNull();
  });
});
