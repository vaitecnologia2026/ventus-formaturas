import { parsePhoneNumberFromString, isValidPhoneNumber } from 'libphonenumber-js/max';

/**
 * Normaliza telefone para E.164 (+5538998765432).
 *
 * Estratégia:
 *   1. Limpa caracteres não-dígito (preserva o + se vier)
 *   2. Tenta parsear com libphonenumber-js
 *   3. Se não tiver DDI, assume `defaultCountryIso` (ex "BR")
 *   4. Devolve { ok, normalized, original, error? }
 *
 * Mantém o original para auditoria — o normalized é o que vai pro provider.
 *
 * @param {string} input — telefone cru ("(38) 99876-5432", "+1 555 1234567")
 * @param {string} defaultCountryIso — ISO 3166-1 alpha-2 ("BR", "US")
 */
export function normalizePhone(input, defaultCountryIso = 'BR') {
  if (input == null || String(input).trim() === '') {
    return { ok: false, normalized: null, original: input, error: 'phone_empty' };
  }
  const original = String(input).trim();
  // Limpa espaços, hífens, parênteses — mantém + e dígitos
  const cleaned = original.replace(/[^\d+]/g, '');
  if (!cleaned) return { ok: false, normalized: null, original, error: 'phone_no_digits' };

  let parsed;
  try {
    parsed = parsePhoneNumberFromString(cleaned, defaultCountryIso);
  } catch (e) {
    return { ok: false, normalized: null, original, error: `phone_parse_failed: ${e.message}` };
  }
  if (!parsed) {
    return { ok: false, normalized: null, original, error: 'phone_unparseable' };
  }
  if (!parsed.isValid()) {
    return { ok: false, normalized: null, original, error: 'phone_invalid_for_country' };
  }
  // E.164: "+5538998765432" — sem espaços, sempre com DDI
  return { ok: true, normalized: parsed.number, original, country: parsed.country };
}

/**
 * Atalho que apenas valida (não tenta corrigir).
 */
export function isValidPhone(input, defaultCountryIso = 'BR') {
  if (!input) return false;
  try {
    return isValidPhoneNumber(String(input).trim(), defaultCountryIso);
  } catch {
    return false;
  }
}
