// Ventus — helper compartilhado do "espaço do aluno" (acesso por link único / token).
// Depende de window.apiUrl (definido em ../assets/js/config.js).

(function (global) {
  const TOKEN_KEY = 'ventus_aluno_token';

  // Lê o token de ?t=<token> (e persiste no localStorage) ou do localStorage.
  function getTokenAluno() {
    let t = '';
    try {
      t = new URLSearchParams(location.search).get('t') || '';
    } catch (e) { t = ''; }

    if (t) {
      try { localStorage.setItem(TOKEN_KEY, t); } catch (e) {}
      return t;
    }
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }

  // Busca os dados do espaço do aluno via /api/meu-espaco/{token}.
  // Retorna o objeto de dados, ou null se não houver token / falhar.
  async function carregarEspaco() {
    const t = getTokenAluno();
    if (!t) return null;
    try {
      const r = await fetch(apiUrl('/api/meu-espaco/' + encodeURIComponent(t)));
      if (!r.ok) return null;
      return await r.json();
    } catch (e) {
      return null;
    }
  }

  // Remove o token salvo (logout).
  function logoutAluno() {
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  }

  global.getTokenAluno = getTokenAluno;
  global.carregarEspaco = carregarEspaco;
  global.logoutAluno = logoutAluno;
  global.VENTUS_ALUNO_TOKEN_KEY = TOKEN_KEY;
})(window);
