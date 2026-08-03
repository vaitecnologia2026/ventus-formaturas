// Ventus Formaturas — Token-based access
// Cliente recebe link com ?t=xxx, sistema valida contra /tokens.json
const VENTUS_AUTH = (() => {
  const STORAGE_KEY = 'ventus_token_v1';
  // Detecta caminho base correto: local usa /novo-sistema-html/, prod usa /
  const TOKENS_URL = (() => {
    const path = location.pathname;
    const idx = path.indexOf('/novo-sistema-html/');
    if (idx >= 0) return path.substring(0, idx) + '/novo-sistema-html/tokens.json';
    return '/tokens.json';
  })();
  let cachedTokens = null;

  // Fallback embutido: gate é privacidade leve (tokens.json é público),
  // então rede nunca pode ser ponto único de falha do acesso.
  // Manter em sincronia com tokens.json ao criar/revogar chaves.
  const FALLBACK = { tokens: [
    { id: 'ventus-2026', para: 'Ventus Formaturas — diretoria', expiraEm: '2026-12-31', ativo: true },
  ] };

  async function loadTokens() {
    if (cachedTokens) return cachedTokens;
    try {
      const r = await fetch(TOKENS_URL, { cache: 'no-store' });
      if (!r.ok) return FALLBACK;
      const data = await r.json();
      if (!data || !Array.isArray(data.tokens) || data.tokens.length === 0) return FALLBACK;
      cachedTokens = data;
      return cachedTokens;
    } catch {
      return FALLBACK;
    }
  }

  function getStored() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function isExpired(tokenObj) {
    if (!tokenObj?.expiraEm) return false;
    return new Date(tokenObj.expiraEm) < new Date();
  }

  async function findToken(id) {
    const data = await loadTokens();
    return (data.tokens || []).find(t => t.id === id) || null;
  }

  async function validateAndStore(id) {
    const t = await findToken(id);
    if (!t || !t.ativo || isExpired(t)) return null;
    const stored = { id: t.id, expiraEm: t.expiraEm, para: t.para };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    return stored;
  }

  async function isUnlocked() {
    const stored = getStored();
    if (!stored) return false;
    if (isExpired(stored)) {
      localStorage.removeItem(STORAGE_KEY);
      return false;
    }
    // Re-valida contra tokens.json em caso de revogação
    const live = await findToken(stored.id);
    if (!live || !live.ativo || isExpired(live)) {
      localStorage.removeItem(STORAGE_KEY);
      return false;
    }
    return true;
  }

  function lock() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function getCurrentUser() {
    const s = getStored();
    return s ? s.para : null;
  }

  // Bootstrap: lê ?t= da URL e valida no carregamento
  async function bootstrap() {
    const params = new URLSearchParams(location.search);
    const tokenFromUrl = params.get('t');
    if (tokenFromUrl) {
      const ok = await validateAndStore(tokenFromUrl);
      // Limpa ?t= da URL pra não vazar em screenshots
      params.delete('t');
      const cleanUrl = location.pathname + (params.toString() ? '?' + params : '') + location.hash;
      history.replaceState(null, '', cleanUrl);
      return !!ok;
    }
    return await isUnlocked();
  }

  // Em páginas internas: redireciona pra index se não autorizado
  // Páginas públicas (turma pública, RSVP, LP, acesso) NÃO são guardadas
  async function guardInternal() {
    const path = location.pathname;
    const isHub = /\/(index)?\.?(html)?$/.test(path) || path.endsWith('/');
    if (isHub) return;

    // Whitelist: páginas públicas (SEO + share) e apresentação (livre)
    const publicPaths = ['/public/', '/convidado/', '/apresentacao/', '/lp.html', '/acesso.html', '/acesso/'];
    if (publicPaths.some(p => path.includes(p))) return;

    const ok = await bootstrap();
    if (!ok) {
      const ret = path + location.search + location.hash;
      const base = path.split('/novo-sistema-html/')[0] + '/novo-sistema-html/';
      const target = path.includes('/novo-sistema-html/') ? base : '/';
      location.href = target + (target.includes('?') ? '&' : '?') + 'retorno=' + encodeURIComponent(ret);
    }
  }

  return { bootstrap, isUnlocked, validateAndStore, lock, getCurrentUser, guardInternal };
})();
