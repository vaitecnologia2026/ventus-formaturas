import crypto from 'crypto';

/**
 * SHA-256 conforme spec do Google Ads Enhanced Conversions:
 * - email: trim + lowercase ANTES do hash
 * - telefone: E.164 (ex: +5538999999999) — sem espaços/parênteses
 * - nome/sobrenome: trim + lowercase + remover diacríticos
 * - cidade/estado: trim + lowercase
 * - país: ISO 3166-1 alpha-2 minúsculo (br, us)
 * - cep: apenas dígitos
 *
 * Retorna hex string de 64 chars (SHA-256). Devolve `undefined` se input vazio
 * para permitir omitir o campo no payload.
 *
 * Referência:
 * https://developers.google.com/google-ads/api/docs/conversions/enhance-conversions#format-data
 */

function stripDiacritics(s) {
  return s.normalize('NFD').replace(/\p{Diacritic}+/gu, '');
}

export function normalizeEmail(input) {
  if (!input) return undefined;
  return String(input).trim().toLowerCase();
}

export function normalizePhone(input) {
  if (!input) return undefined;
  const digits = String(input).replace(/[^\d+]/g, '');
  if (!digits) return undefined;
  // Se já vier com +, mantém. Se for número BR com 12-13 dígitos sem +, prepende +.
  if (digits.startsWith('+')) return digits;
  // Heurística: 10-11 dígitos = BR sem DDI -> +55; 12-13 dígitos com 55 prefixo -> +55...
  if (/^55\d{10,11}$/.test(digits)) return `+${digits}`;
  if (/^\d{10,11}$/.test(digits)) return `+55${digits}`;
  return `+${digits}`;
}

export function normalizeName(input) {
  if (!input) return undefined;
  return stripDiacritics(String(input).trim().toLowerCase()).replace(/\s+/g, ' ');
}

export function normalizeRegion(input) {
  if (!input) return undefined;
  return stripDiacritics(String(input).trim().toLowerCase()).replace(/\s+/g, ' ');
}

export function normalizeCountry(input) {
  if (!input) return undefined;
  return String(input).trim().toLowerCase().slice(0, 2);
}

export function normalizePostalCode(input) {
  if (!input) return undefined;
  return String(input).replace(/\D/g, '');
}

export function sha256(value) {
  if (value == null || value === '') return undefined;
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

export function hashUserIdentifiers(input) {
  // Recebe dados crus, normaliza e hasheia.
  const out = {};
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  const firstName = normalizeName(input.firstName);
  const lastName = normalizeName(input.lastName);
  const city = normalizeRegion(input.city);
  const state = normalizeRegion(input.state);
  const country = normalizeCountry(input.country);
  const postalCode = normalizePostalCode(input.postalCode);
  if (email)      out.hashedEmail = sha256(email);
  if (phone)      out.hashedPhoneNumber = sha256(phone);
  if (firstName)  out.hashedFirstName = sha256(firstName);
  if (lastName)   out.hashedLastName = sha256(lastName);
  if (city)       out.city = city; // address attributes não são hasheados, mas normalizados
  if (state)      out.state = state;
  if (country)    out.countryCode = country;
  if (postalCode) out.postalCode = postalCode;
  return out;
}
