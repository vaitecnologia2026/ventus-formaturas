// Shell do ESPAÇO DO ALUNO — no desktop injeta um menu lateral (app full-width);
// no celular fica escondido e continua valendo o bottom-nav. Depende de espaco.js
// (getTokenAluno) e config.js já carregados na página.
(function () {
  var ITENS = [
    { href: 'inicio.html',     icon: 'home',        label: 'Início' },
    { href: 'galeria.html',    icon: 'image',       label: 'Fotos' },
    { href: 'pagamento.html',  icon: 'credit-card', label: 'Pagamento' },
    { href: 'convidados.html', icon: 'users',       label: 'Convidados' },
    { href: 'pacotes.html',    icon: 'package',     label: 'Pacotes' },
  ];

  function tokenQS() {
    try {
      var t = (typeof getTokenAluno === 'function') ? getTokenAluno() : '';
      return t ? ('?t=' + encodeURIComponent(t)) : '';
    } catch (e) { return ''; }
  }

  function paginaAtual() {
    return (location.pathname.split('/').pop() || 'inicio.html').toLowerCase();
  }

  // Garante que TODO link interno do aluno (bottom-nav, atalhos, etc.) leve o token
  // junto — senão a página de destino (ex.: pagamento) não acha o token e cai no login.
  function propagarTokenNosLinks() {
    var t = '';
    try { t = (typeof getTokenAluno === 'function') ? getTokenAluno() : ''; } catch (e) { t = ''; }
    if (!t) return;
    document.querySelectorAll('a[href]').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#') return;
      if (/^https?:|^\/\/|^mailto:|^tel:/i.test(href)) return;   // externos
      if (/[?&]t=/.test(href)) return;                            // já tem token
      if (!/\.html(\?|#|$)/i.test(href)) return;                  // só páginas .html
      a.setAttribute('href', href + (href.indexOf('?') >= 0 ? '&' : '?') + 't=' + encodeURIComponent(t));
    });
  }

  function montar() {
    if (document.querySelector('.aluno-sidebar')) return;
    var atual = paginaAtual();
    var qs = tokenQS();
    var links = ITENS.map(function (it) {
      var ativo = it.href.toLowerCase() === atual ? ' active' : '';
      return '<a href="' + it.href + qs + '" class="aluno-sb-link' + ativo + '">' +
        '<i data-lucide="' + it.icon + '"></i><span>' + it.label + '</span></a>';
    }).join('');

    var aside = document.createElement('aside');
    aside.className = 'aluno-sidebar';
    aside.innerHTML =
      '<div class="aluno-sb-brand">' +
        '<img src="/assets/img/icon-branco.png" alt="Ventus">' +
        '<div><strong>Ventus</strong><span>Meu espaço</span></div>' +
      '</div>' +
      '<nav class="aluno-sb-nav">' + links + '</nav>' +
      '<div class="aluno-sb-footer">' +
        '<div class="aluno-sb-avatar" id="sb-avatar">•</div>' +
        '<div class="aluno-sb-user"><strong id="sb-nome">Formando</strong><span id="sb-turma">—</span></div>' +
      '</div>';
    document.body.insertBefore(aside, document.body.firstChild);
    if (window.lucide) { try { lucide.createIcons(); } catch (e) {} }

    propagarTokenNosLinks();

    // preenche nome/turma do aluno (se o espaco.js tiver o helper)
    if (typeof carregarEspaco === 'function') {
      carregarEspaco().then(function (d) {
        if (!d) return;
        var nome = (d.aluno && d.aluno.nome) || d.nome || 'Formando';
        var turma = (d.turma && d.turma.nome) || d.turma || '';
        var n = document.getElementById('sb-nome'); if (n) n.textContent = nome;
        var t = document.getElementById('sb-turma'); if (t) t.textContent = turma || '—';
        var a = document.getElementById('sb-avatar');
        if (a) {
          var p = String(nome).trim().split(/\s+/);
          a.textContent = ((p[0] || '')[0] || '' ) + (p.length > 1 ? (p[p.length - 1][0] || '') : '');
        }
      }).catch(function () {});
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
  else montar();
})();
