/**
 * Extração de campo de uma resposta JSON via dot-path.
 *
 * Suporta:
 *   - Dot:        "data.message.id"
 *   - Array index: "items.0.id"  ou  "items[0].id"
 *
 * Não é JSONPath completo — sem $, sem wildcards, sem expressões.
 * Suficiente pra "messageId está em response.data.id" típico de provider.
 *
 * Retorna `undefined` se qualquer parte do caminho não existir.
 */
export function getByPath(obj, path) {
  if (obj == null || !path) return undefined;
  // Normaliza "items[0].id" → "items.0.id"
  const normalized = String(path).replace(/\[(\d+)\]/g, '.$1');
  const parts = normalized.split('.').filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}
