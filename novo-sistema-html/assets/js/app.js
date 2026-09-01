// Ventus Formaturas — global UX layer (protótipo)
// Cobre: ícones Lucide, toast em ações simuladas, troca de tabs, ativação de filtros, seleção de fotos.

document.addEventListener('DOMContentLoaded', () => {
  aplicarTema();          // tema claro/escuro salvo
  renderAdminSidebar();   // se houver #admin-sidebar
  if (window.lucide) lucide.createIcons();
  installToastContainer();
  installTabSwitcher();
  installMobileNav();
  installThemeToggle();
  installTableScroll();
});

/* ================== Tema claro / escuro ================== */
function aplicarTema() {
  const t = localStorage.getItem('ventus-theme') || 'light';
  document.documentElement.setAttribute('data-theme', t);
}
function installThemeToggle() {
  const topbar = document.querySelector('.topbar');
  if (!topbar || topbar.querySelector('.theme-toggle')) return;
  const btn = document.createElement('button');
  btn.className = 'theme-toggle';
  btn.setAttribute('aria-label', 'Alternar tema claro/escuro');
  topbar.appendChild(btn);
  const pintar = () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    btn.innerHTML = `<i data-lucide="${dark ? 'sun' : 'moon'}"></i>`;
    if (window.lucide) lucide.createIcons();
  };
  btn.addEventListener('click', () => {
    const novo = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', novo);
    localStorage.setItem('ventus-theme', novo);
    pintar();
  });
  pintar();
}

/* ================== Navegação mobile (hambúrguer + overlay) ================== */
function installMobileNav() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar || document.querySelector('.topbar-menu-btn')) return;
  const topbar = document.querySelector('.topbar');

  const btn = document.createElement('button');
  btn.className = 'topbar-menu-btn';
  btn.setAttribute('aria-label', 'Abrir menu');
  btn.innerHTML = '<i data-lucide="menu"></i>';
  if (topbar) topbar.insertBefore(btn, topbar.firstChild);
  else { btn.classList.add('topbar-menu-btn--float'); document.body.appendChild(btn); }

  const backdrop = document.createElement('div');
  backdrop.className = 'sidebar-backdrop';
  document.body.appendChild(backdrop);

  const fechar = () => document.body.classList.remove('nav-open');
  btn.addEventListener('click', () => document.body.classList.toggle('nav-open'));
  backdrop.addEventListener('click', fechar);
  sidebar.addEventListener('click', (e) => { if (e.target.closest('a')) fechar(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fechar(); });
  window.addEventListener('resize', () => { if (window.innerWidth > 900) fechar(); });

  if (window.lucide) lucide.createIcons();
}

/* ================== Tabelas roláveis no mobile ================== */
function installTableScroll() {
  document.querySelectorAll('table.table').forEach(t => {
    if (t.closest('.table-scroll')) return;
    const wrap = document.createElement('div');
    wrap.className = 'table-scroll';
    t.parentNode.insertBefore(wrap, t);
    wrap.appendChild(t);
  });
}

/* ================== Admin Sidebar (render dinâmico) ================== */
function renderAdminSidebar() {
  const el = document.getElementById('admin-sidebar');
  if (!el) return;

  const path = (location.pathname.split('/').pop() || '').toLowerCase();
  // todos os 19 itens da sidebar apontam para telas existentes — sem "EM BREVE"
  const groups = [
    {
      title: 'Geral',
      items: [
        { href: 'dashboard.html',         icon: 'layout-dashboard', label: 'Painel' },
        { href: 'turmas.html',            icon: 'users-round',      label: 'Turmas' },
        { href: 'eventos.html',           icon: 'calendar',         label: 'Eventos' },
        { href: 'modo-tv.html',           icon: 'tv',               label: 'Modo TV', blank: true },
      ],
    },
    {
      title: 'Operação',
      items: [
        { href: 'os.html',                icon: 'clipboard-list',   label: 'Ordens de Serviço' },
        { href: 'brindes-pendentes.html', icon: 'gift',             label: 'Brindes pendentes' },
        { href: 'galerias.html',          icon: 'images',           label: 'Galerias e Fotos' },
        { href: 'checkin-ao-vivo.html',   icon: 'qr-code',          label: 'Check-in ao vivo' },
      ],
    },
    {
      title: 'Etapa 2 · Produção',
      items: [
        { href: '../fotografo/upload.html', icon: 'camera',         label: 'Fotógrafo · Upload', blank: true },
        { href: '../editor/fila.html',      icon: 'wand-2',         label: 'Editor · Fila', blank: true },
        { href: '../operador/checkin.html', icon: 'scan-line',      label: 'Operador · Check-in', blank: true },
        { href: '../aluno/inicio.html?id=1', icon: 'graduation-cap', label: 'Formando (prévia)', blank: true },
      ],
    },
    {
      title: 'Comercial',
      items: [
        { href: 'planos.html',            icon: 'package-2',        label: 'Planos' },
        { href: 'contratos.html',         icon: 'file-signature',   label: 'Contratos' },
        { href: 'produtos-adicionais.html', icon: 'shopping-bag',   label: 'Produtos Adicionais' },
        { href: 'financeiro.html',        icon: 'banknote',         label: 'Financeiro' },
      ],
    },
    {
      title: 'Comunicação',
      items: [
        { href: 'comunicacao.html',       icon: 'megaphone',        label: 'VAI WhatsApp + E-mail' },
        { href: 'ia-interna.html',        icon: 'sparkles',         label: 'IA Interna' },
      ],
    },
    {
      title: 'Cadastros',
      items: [
        { href: 'cadastro.html',          icon: 'database',         label: 'Cadastros' },
        { href: 'usuarios.html',          icon: 'shield-check',     label: 'Usuários' },
      ],
    },
    {
      title: 'Sistema',
      items: [
        { href: 'configuracoes.html',     icon: 'settings',         label: 'Configurações' },
        { href: 'seguranca.html',         icon: 'shield',           label: 'Segurança' },
        { href: 'importacao.html',        icon: 'database-zap',     label: 'Importação' },
        { href: 'relatorios.html',        icon: 'file-text',        label: 'Relatórios' },
      ],
    },
  ];

  let html = `
    <div class="sidebar-brand">
      <div class="sidebar-brand-mark"><img src="/assets/img/icon-branco.png" alt="Ventus"></div>
      <div><div>Ventus</div><div style="font-size:11px;font-weight:400;opacity:.6;">Formaturas</div></div>
    </div>
  `;

  for (const g of groups) {
    html += `<div class="sidebar-section">${g.title}</div>`;
    for (const it of g.items) {
      const active = it.href.toLowerCase() === path ? 'active' : '';
      if (it.coming) {
        // Link "Em breve" — não navega; o click interceptor mostra toast
        html += `<a href="#" class="sidebar-link sidebar-link-coming" data-coming-label="${it.label}" style="opacity:.55;"
                    title="Em breve"><i data-lucide="${it.icon}"></i>${it.label}<span style="margin-left:auto;font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;background:rgba(251,191,36,.18);color:#FCD34D;padding:2px 6px;border-radius:4px;">EM BREVE</span></a>`;
      } else if (it.blank) {
        // Abre em JANELA/ABA NOVA (ex.: Modo TV — pra jogar no telão)
        html += `<a href="${it.href}" class="sidebar-link ${active}" target="_blank" rel="noopener"><i data-lucide="${it.icon}"></i>${it.label}<span style="margin-left:auto;opacity:.5;font-size:13px;">↗</span></a>`;
      } else {
        html += `<a href="${it.href}" class="sidebar-link ${active}"><i data-lucide="${it.icon}"></i>${it.label}</a>`;
      }
    }
  }

  const userInfo = el.dataset.user || 'Elison Perini · Admin';
  const [name, role] = userInfo.split(' · ');
  const initials = (name || 'EP').split(' ').slice(0,2).map(p => p[0]).join('').toUpperCase();
  html += `
    <div class="sidebar-footer">
      <div class="avatar">${initials}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name || 'Elison Perini'}</div>
        <div style="font-size:11px;opacity:.6;">${role || 'Admin'}</div>
      </div>
      <a href="../index.html" title="Hub" style="color:rgba(255,255,255,.6);"><i data-lucide="home" class="w-4 h-4"></i></a>
    </div>
  `;

  el.innerHTML = html;
  el.style.overflowY = 'auto';
}

/* ================== Toast ================== */
function installToastContainer() {
  if (document.getElementById('vt-toast-stack')) return;
  const stack = document.createElement('div');
  stack.id = 'vt-toast-stack';
  stack.style.cssText = `
    position: fixed; bottom: 20px; right: 20px; z-index: 9999;
    display: flex; flex-direction: column; gap: 8px;
    pointer-events: none;
  `;
  document.body.appendChild(stack);

  const style = document.createElement('style');
  style.textContent = `
    .vt-toast {
      background: #0F172A; color: white;
      padding: 12px 16px; border-radius: 12px;
      font-size: 13px; font-weight: 500;
      box-shadow: 0 12px 32px rgba(15,23,42,.32);
      pointer-events: auto;
      max-width: 360px;
      display: flex; align-items: center; gap: 10px;
      animation: vt-toast-in .2s ease-out;
      border: 1px solid rgba(255,255,255,.08);
    }
    .vt-toast::before {
      content: '⚡';
      width: 22px; height: 22px;
      background: #2563EB; border-radius: 50%;
      display: grid; place-items: center;
      font-size: 12px; flex-shrink: 0;
    }
    .vt-toast.fade { animation: vt-toast-out .2s ease-in forwards; }
    @keyframes vt-toast-in  { from { opacity:0; transform: translateY(8px); } to { opacity:1; transform: none; } }
    @keyframes vt-toast-out { to { opacity:0; transform: translateY(8px); } }
  `;
  document.head.appendChild(style);
}

function showToast(msg) {
  const stack = document.getElementById('vt-toast-stack');
  if (!stack) return;
  const t = document.createElement('div');
  t.className = 'vt-toast';
  t.textContent = msg;
  stack.appendChild(t);
  setTimeout(() => { t.classList.add('fade'); }, 2200);
  setTimeout(() => { t.remove(); }, 2500);
}

/* ================== Modais (confirm/alert/form) ================== */
const VT_SVG = {
  danger: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>',
  warn:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  info:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
  x:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
};

function installModalStyles() {
  if (document.getElementById('vt-modal-styles')) return;
  const s = document.createElement('style');
  s.id = 'vt-modal-styles';
  s.textContent = `
    .vt-ov{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;
      padding:16px;background:rgba(10,37,64,.5);backdrop-filter:blur(4px);opacity:0;transition:opacity .16s ease;}
    .vt-ov.on{opacity:1;}
    .vt-modal{background:var(--surface,#fff);width:min(420px,100%);border-radius:16px;overflow:hidden;border:1px solid var(--gray-100,#F1F5F9);
      box-shadow:0 24px 70px -18px rgba(15,23,42,.55);transform:translateY(10px) scale(.985);transition:transform .18s cubic-bezier(.2,.8,.2,1);}
    .vt-ov.on .vt-modal{transform:none;}
    .vt-modal.lg{width:min(760px,100%);}
    .vt-modal-h{display:flex;align-items:center;gap:10px;padding:16px 20px;font-size:15.5px;font-weight:800;
      color:var(--gray-900,#0F172A);border-bottom:1px solid var(--gray-100,#F1F5F9);}
    .vt-modal-h .vt-x{margin-left:auto;border:0;background:transparent;color:var(--gray-400,#94A3B8);
      width:32px;height:32px;border-radius:9px;cursor:pointer;display:grid;place-items:center;transition:.15s;flex:none;}
    .vt-modal-h .vt-x:hover{background:var(--gray-100,#F1F5F9);color:var(--gray-900,#0F172A);}
    .vt-modal-h .vt-x svg{width:18px;height:18px;}
    .vt-modal-b{padding:22px 22px 6px;color:var(--gray-500,#64748B);font-size:14px;line-height:1.55;max-height:72vh;overflow:auto;}
    .vt-dialog-row{display:flex;gap:15px;align-items:flex-start;}
    .vt-modal-ic{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;flex:none;}
    .vt-modal-ic svg{width:22px;height:22px;}
    .vt-modal-ic.warn{background:var(--warning-bg,#FEF3C7);color:var(--warning-fg,#92400E);}
    .vt-modal-ic.info{background:var(--primary-50,#EFF6FF);color:var(--primary-700,#1D4ED8);}
    .vt-modal-ic.danger{background:var(--danger-bg,#FEE2E2);color:var(--danger-fg,#991B1B);}
    .vt-dialog-tit{font-size:16px;font-weight:800;color:var(--gray-900,#0F172A);margin-bottom:5px;line-height:1.3;}
    .vt-modal-f{display:flex;gap:10px;justify-content:flex-end;padding:18px 22px 20px;flex-wrap:wrap;}
    .vt-btn{border:0;border-radius:11px;padding:11px 20px;font-size:14px;font-weight:700;font-family:inherit;cursor:pointer;transition:.15s;min-width:98px;}
    .vt-btn-primary{background:var(--primary-600,#2563EB);color:#fff;} .vt-btn-primary:hover{background:var(--primary-700,#1D4ED8);}
    .vt-btn-danger{background:var(--danger,#DC2626);color:#fff;} .vt-btn-danger:hover{filter:brightness(.93);}
    .vt-btn-ghost{background:var(--gray-100,#F1F5F9);color:var(--gray-700,#334155);} .vt-btn-ghost:hover{background:var(--gray-200,#E2E8F0);}
    @media(max-width:440px){
      .vt-ov{padding:0;align-items:flex-end;}
      .vt-modal{width:100%;border-radius:18px 18px 0 0;border-bottom:0;}
      .vt-modal-f{padding:16px;} .vt-modal-f .vt-btn{flex:1;min-width:0;}
    }
  `;
  document.head.appendChild(s);
}

// centraliza o overlay na ÁREA DE CONTEÚDO (depois do sidebar fixo), não na viewport toda
function vtSidebarOffset(ov) {
  try {
    const sb = document.querySelector('.sidebar');
    if (!sb) return;
    const r = sb.getBoundingClientRect();
    if (r.right > 40 && r.right < window.innerWidth * 0.5) ov.style.left = r.right + 'px';
  } catch (e) {}
}

function vtDialog(o) {
  installModalStyles();
  const kind = o.kind || 'alert';
  const tone = o.danger ? 'danger' : (kind === 'confirm' ? 'warn' : 'info');
  const svg = VT_SVG[o.danger ? 'danger' : (kind === 'confirm' ? 'warn' : 'info')];
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'vt-ov';
    ov.innerHTML = `<div class="vt-modal" role="dialog" aria-modal="true">
      <div class="vt-modal-b"><div class="vt-dialog-row">
        <div class="vt-modal-ic ${tone}">${svg}</div>
        <div style="flex:1;min-width:0;">
          ${o.title ? `<div class="vt-dialog-tit">${o.title}</div>` : ''}
          <div>${(o.message || '').replace(/\n/g, '<br>')}</div>
        </div>
      </div></div>
      <div class="vt-modal-f">
        ${kind === 'confirm' ? `<button class="vt-btn vt-btn-ghost" data-x="0">${o.cancelText || 'Cancelar'}</button>` : ''}
        <button class="vt-btn ${o.danger ? 'vt-btn-danger' : 'vt-btn-primary'}" data-x="1">${o.okText || (kind === 'confirm' ? 'Confirmar' : 'OK')}</button>
      </div></div>`;
    document.body.appendChild(ov);
    vtSidebarOffset(ov);
    requestAnimationFrame(() => ov.classList.add('on'));
    const done = (v) => { ov.classList.remove('on'); setTimeout(() => ov.remove(), 170); document.removeEventListener('keydown', onKey); resolve(v); };
    function onKey(e) { if (e.key === 'Escape') done(false); if (e.key === 'Enter') done(true); }
    ov.addEventListener('click', e => {
      const b = e.target.closest('[data-x]');
      if (b) return done(b.dataset.x === '1');
      if (e.target === ov && kind !== 'confirm') done(false);
    });
    document.addEventListener('keydown', onKey);
    setTimeout(() => { const btn = ov.querySelector('.vt-btn-primary,.vt-btn-danger'); btn && btn.focus(); }, 60);
  });
}

// API pública
window.vtConfirm = (message, opts = {}) => vtDialog({ message, kind: 'confirm', ...opts });
window.vtAlert   = (message, opts = {}) => vtDialog({ message, kind: 'alert', ...opts });

// Modal genérico p/ conteúdo (ex.: formulários). Retorna { close }.
window.vtModal = function ({ title, bodyHTML, size, onClose }) {
  installModalStyles();
  const ov = document.createElement('div');
  ov.className = 'vt-ov';
  ov.innerHTML = `<div class="vt-modal ${size === 'lg' ? 'lg' : ''}" role="dialog" aria-modal="true">
    <div class="vt-modal-h">${title || ''}<button class="vt-x" aria-label="Fechar">${VT_SVG.x}</button></div>
    <div class="vt-modal-b vt-modal-slot"></div></div>`;
  if (typeof bodyHTML === 'string') ov.querySelector('.vt-modal-slot').innerHTML = bodyHTML;
  else if (bodyHTML) ov.querySelector('.vt-modal-slot').appendChild(bodyHTML);
  document.body.appendChild(ov);
  vtSidebarOffset(ov);
  requestAnimationFrame(() => ov.classList.add('on'));
  if (window.lucide) try { lucide.createIcons(); } catch (e) {}
  const close = () => { ov.classList.remove('on'); setTimeout(() => ov.remove(), 170); document.removeEventListener('keydown', onKey); if (onClose) onClose(); };
  function onKey(e) { if (e.key === 'Escape') close(); }
  ov.querySelector('.vt-x').addEventListener('click', close);
  ov.addEventListener('click', e => { if (e.target === ov) close(); });
  document.addEventListener('keydown', onKey);
  return { close, el: ov.querySelector('.vt-modal-slot') };
};

/* ================== Click interceptor ================== */
function installClickInterceptor() {
  document.addEventListener('click', (e) => {
    // 1. Sidebar links "Em breve" — bloqueia navegação e mostra toast claro
    const coming = e.target.closest('a.sidebar-link-coming');
    if (coming) {
      e.preventDefault();
      const label = coming.dataset.comingLabel || 'Esta tela';
      showToast(`${label} · Em breve`);
      return;
    }

    // 2. Captura clicks em <a href="#"> que NÃO têm marcação especial
    const a = e.target.closest('a[href="#"]');
    if (a && !a.dataset.handled) {
      // Permite tabs (têm classe .tab e são tratadas em outro lugar)
      if (a.classList.contains('tab')) return;
      // Permite âncoras de seção real (#finalizar, etc)
      const href = a.getAttribute('href');
      if (href && href.length > 1 && href !== '#') return;

      e.preventDefault();
      const label = (a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80) || 'Ação';
      showToast(`Simulado: ${label}`);
      return;
    }

    // Botões sem destino claro — mostra toast também (exceto os que têm onclick ou type=submit)
    const btn = e.target.closest('button:not([data-no-toast])');
    if (btn && !btn.onclick && !btn.dataset.handled) {
      const isInForm = btn.closest('form');
      const isSubmit = btn.type === 'submit';
      if (isSubmit && isInForm) return; // deixa o form trabalhar
      // Pula botões que só são wrappers de ícone sem texto significativo
      const txt = (btn.innerText || '').trim();
      if (!txt) return;
      // Pula toggles internos (têm classes específicas)
      if (btn.classList.contains('tab') || btn.dataset.toggle) return;

      e.preventDefault();
      showToast(`Simulado: ${txt.slice(0, 80)}`);
    }
  });
}

/* ================== Tabs ================== */
function installTabSwitcher() {
  document.querySelectorAll('.tabs').forEach(group => {
    const tabs = group.querySelectorAll('.tab');
    // descobre todos os panels associados a este grupo (mesmo container pai)
    const container = group.closest('main') || group.parentElement;
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const tabKey = tab.dataset.tab;
        if (tabKey && container) {
          container.querySelectorAll('[data-tab-panel]').forEach(p => {
            p.hidden = (p.dataset.tabPanel !== tabKey);
          });
          // re-criar ícones dentro do panel ativado
          if (window.lucide) lucide.createIcons();
        } else {
          // sem panels: só feedback
          showToast(`Aba: ${(tab.textContent || '').trim()}`);
        }
      });
    });
  });
}

/* ================== Filtros (selects) ================== */
function installFilterSelectFeedback() {
  document.querySelectorAll('select.select').forEach(sel => {
    sel.addEventListener('change', () => {
      const label = sel.options[sel.selectedIndex]?.text || sel.value;
      showToast(`Filtro aplicado: ${label}`);
    });
  });
}

/* ================== Foto (galeria do aluno) ================== */
function togglePhoto(el) {
  el.classList.toggle('selected');
  const used = document.querySelectorAll('.photo-tile.selected').length;
  const counter = document.getElementById('selecao-counter');
  if (counter) counter.textContent = used;
  const counterBottom = document.getElementById('counter-bottom');
  if (counterBottom) counterBottom.textContent = used;
}

/* ================== Helpers ================== */
function fmtMoney(v) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function fmtDate(d) {
  return new Date(d).toLocaleDateString('pt-BR');
}
