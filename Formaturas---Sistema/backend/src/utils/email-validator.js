/**
 * Validação de email — RFC 5322 simplificado.
 *
 * Não fazemos lookup de MX/DNS por padrão (latência alta).
 * O provider real vai validar de novo do lado dele.
 */

// Regex pragmática: cobre 99% dos casos reais sem o monstro completo do RFC
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

const MAX_LOCAL  = 64;
const MAX_DOMAIN = 255;
const MAX_TOTAL  = 320;

export function isValidEmail(input) {
  if (input == null || typeof input !== 'string') return false;
  const e = input.trim();
  if (!e || e.length > MAX_TOTAL) return false;
  if (!EMAIL_RE.test(e)) return false;
  const at = e.lastIndexOf('@');
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  if (local.length > MAX_LOCAL || domain.length > MAX_DOMAIN) return false;
  // Sem dois pontos consecutivos no local-part
  if (local.includes('..')) return false;
  return true;
}

/**
 * Normaliza para comparação/storage: trim + lowercase do domínio.
 * Local-part do Gmail/etc tecnicamente é case-sensitive, mas todo provider trata como insensitive
 * — então deixamos tudo em minúsculas (incluindo local) para dedup/suppression funcionar.
 */
export function normalizeEmail(input) {
  if (!isValidEmail(input)) return null;
  return input.trim().toLowerCase();
}
