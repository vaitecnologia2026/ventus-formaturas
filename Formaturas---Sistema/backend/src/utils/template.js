/**
 * Substituição mustache-lite — apenas {{var}} e {{nested.path}}.
 *
 * Não suporta loops, conditionals, helpers — só interpolação simples.
 * Suficiente pro caso de body templates de provider.
 *
 * Aceita:
 *   - String:  `"to: {{to}}"`           → `"to: +5538..."`
 *   - Object:  `{ to: "{{to}}" }`        → `{ to: "+5538..." }` (recursivo)
 *   - Array:   `["{{a}}", "{{b}}"]`     → `["x", "y"]`
 *   - Outros tipos passam direto.
 *
 * Variáveis ausentes vão para `missing[]` para o caller decidir o que fazer.
 */
export function renderTemplate(template, vars) {
  const missing = new Set();
  const rendered = walk(template, vars, missing);
  return { rendered, missing: [...missing] };
}

function walk(node, vars, missing) {
  if (typeof node === 'string') return interpolate(node, vars, missing);
  if (Array.isArray(node)) return node.map(item => walk(item, vars, missing));
  if (node && typeof node === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = walk(v, vars, missing);
    return out;
  }
  return node;
}

const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g;

function interpolate(str, vars, missing) {
  // Caso especial: a string inteira é UM placeholder → preserva o tipo (number, bool, object)
  const fullMatch = str.match(/^\{\{\s*([\w.]+)\s*\}\}$/);
  if (fullMatch) {
    const v = resolve(vars, fullMatch[1]);
    if (v === undefined) { missing.add(fullMatch[1]); return ''; }
    return v;
  }
  // Substitui inline: "Olá {{nome}}, valor R$ {{valor}}"
  return str.replace(PLACEHOLDER, (_, key) => {
    const v = resolve(vars, key);
    if (v === undefined) { missing.add(key); return ''; }
    return String(v);
  });
}

function resolve(obj, dotted) {
  const parts = dotted.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}
