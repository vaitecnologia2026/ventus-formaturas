/* ============================================================
   Botão flutuante "Reportar erro" (global, idempotente).
   - Captura o PRINT da tela atual (html2canvas, carregado sob demanda)
   - Usuário escreve a observação do erro
   - Envia pra POST /api/erro-reporte (print vai pro R2 no backend)
   Basta incluir este script em qualquer página.
   ============================================================ */
(function () {
  if (window.__reportarErroCarregado) return;
  window.__reportarErroCarregado = true;

  // Base da API (usa a global se existir; senão replica o config.js)
  function apiBase() {
    if (typeof window.apiUrl === 'function') return null; // usaremos window.apiUrl
    if (window.VENTUS_API) return window.VENTUS_API;
    return (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? '' : 'https://ventus-api-production-75c2.up.railway.app';
  }
  function urlApi(path) {
    if (typeof window.apiUrl === 'function') return window.apiUrl(path);
    return (apiBase() || '').replace(/\/$/, '') + path;
  }

  function carregarHtml2Canvas() {
    return new Promise(function (resolve, reject) {
      if (window.html2canvas) return resolve(window.html2canvas);
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      s.onload = function () { resolve(window.html2canvas); };
      s.onerror = function () { reject(new Error('html2canvas')); };
      document.head.appendChild(s);
    });
  }

  var estilo = document.createElement('style');
  estilo.textContent =
    '#rep-erro-btn{position:fixed;right:16px;bottom:16px;z-index:99998;display:inline-flex;align-items:center;gap:8px;' +
    'background:#DC2626;color:#fff;border:none;border-radius:999px;padding:11px 16px;font-size:13px;font-weight:700;' +
    'font-family:inherit;cursor:pointer;box-shadow:0 8px 24px rgba(220,38,38,.35);transition:filter .15s,transform .15s;}' +
    '#rep-erro-btn:hover{filter:brightness(1.06);transform:translateY(-1px);}' +
    '#rep-erro-btn svg{width:16px;height:16px;}' +
    '@media print{#rep-erro-btn{display:none!important;}}' +
    '#rep-erro-ov{position:fixed;inset:0;z-index:99999;background:rgba(10,37,64,.55);display:none;align-items:center;' +
    'justify-content:center;padding:24px 16px;}' +
    '#rep-erro-modal{background:#fff;border-radius:16px;max-width:520px;width:100%;max-height:90vh;overflow:auto;' +
    'box-shadow:0 24px 64px -16px rgba(10,37,64,.55);font-family:inherit;}' +
    '#rep-erro-modal .rh{padding:16px 20px;border-bottom:1px solid #E5E7EB;display:flex;align-items:center;justify-content:space-between;}' +
    '#rep-erro-modal .rh strong{font-size:15px;color:#0F172A;}' +
    '#rep-erro-modal .rb{padding:18px 20px;}' +
    '#rep-erro-shot{width:100%;border:1px solid #E5E7EB;border-radius:10px;margin-bottom:14px;background:#F8FAFC;}' +
    '#rep-erro-obs{width:100%;min-height:96px;padding:12px 14px;border:1px solid #CBD5E1;border-radius:11px;font-family:inherit;' +
    'font-size:14px;outline:none;resize:vertical;box-sizing:border-box;}' +
    '#rep-erro-modal .rf{display:flex;justify-content:flex-end;gap:10px;padding:0 20px 18px;}' +
    '#rep-erro-modal button.b{border:none;border-radius:10px;padding:10px 16px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;}' +
    '#rep-erro-cancel{background:#F1F5F9;color:#334155;}#rep-erro-enviar{background:#2563EB;color:#fff;}' +
    '#rep-erro-enviar[disabled]{opacity:.6;cursor:default;}';
  (document.head || document.documentElement).appendChild(estilo);

  var btn = document.createElement('button');
  btn.id = 'rep-erro-btn';
  btn.type = 'button';
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/></svg><span>Reportar erro</span>';

  var overlay = document.createElement('div');
  overlay.id = 'rep-erro-ov';
  overlay.innerHTML =
    '<div id="rep-erro-modal">' +
      '<div class="rh"><strong>Reportar erro</strong>' +
        '<button class="b" id="rep-erro-x" style="background:none;padding:4px;color:#64748B;font-size:20px;line-height:1;">×</button></div>' +
      '<div class="rb">' +
        '<img id="rep-erro-shot" alt="Captura da tela">' +
        '<textarea id="rep-erro-obs" placeholder="Descreva o que aconteceu / o que estava fazendo…"></textarea>' +
        '<div id="rep-erro-msg" style="font-size:12px;margin-top:8px;"></div>' +
      '</div>' +
      '<div class="rf">' +
        '<button class="b" id="rep-erro-cancel">Cancelar</button>' +
        '<button class="b" id="rep-erro-enviar">Enviar reporte</button>' +
      '</div>' +
    '</div>';

  function pronto() {
    document.body.appendChild(btn);
    document.body.appendChild(overlay);

    var shotEl = overlay.querySelector('#rep-erro-shot');
    var obsEl = overlay.querySelector('#rep-erro-obs');
    var msgEl = overlay.querySelector('#rep-erro-msg');
    var enviarEl = overlay.querySelector('#rep-erro-enviar');
    var dataUrl = '';

    function abrir() { overlay.style.display = 'flex'; }
    function fechar() { overlay.style.display = 'none'; obsEl.value = ''; msgEl.textContent = ''; }

    btn.addEventListener('click', function () {
      msgEl.textContent = ''; obsEl.value = '';
      shotEl.removeAttribute('src'); dataUrl = '';
      abrir();
      btn.style.visibility = 'hidden';
      carregarHtml2Canvas().then(function (h2c) {
        return h2c(document.body, {
          x: window.scrollX, y: window.scrollY,
          width: window.innerWidth, height: window.innerHeight,
          scale: Math.min(1, 900 / window.innerWidth), useCORS: true, logging: false, backgroundColor: '#ffffff'
        });
      }).then(function (canvas) {
        dataUrl = canvas.toDataURL('image/jpeg', 0.72);
        shotEl.src = dataUrl;
      }).catch(function () {
        msgEl.style.color = '#B45309';
        msgEl.textContent = 'Não consegui capturar o print automaticamente, mas você pode enviar a descrição mesmo assim.';
      }).finally(function () {
        btn.style.visibility = '';
      });
    });

    overlay.querySelector('#rep-erro-cancel').addEventListener('click', fechar);
    overlay.querySelector('#rep-erro-x').addEventListener('click', fechar);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) fechar(); });

    enviarEl.addEventListener('click', function () {
      var obs = (obsEl.value || '').trim();
      if (!obs) { msgEl.style.color = '#DC2626'; msgEl.textContent = 'Escreva uma breve descrição do erro.'; obsEl.focus(); return; }
      enviarEl.disabled = true; enviarEl.textContent = 'Enviando…';
      var reporter = '';
      try { reporter = localStorage.getItem('ventus.email') || ''; } catch (e) {}
      fetch(urlApi('/api/erro-reporte'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ obs: obs, url: location.href, user_agent: navigator.userAgent, reporter: reporter, screenshot: dataUrl })
      }).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      }).then(function () {
        msgEl.style.color = '#16A34A'; msgEl.textContent = '✓ Reporte enviado! Obrigado.';
        enviarEl.textContent = 'Enviado ✓';
        setTimeout(fechar, 1200);
        setTimeout(function () { enviarEl.disabled = false; enviarEl.textContent = 'Enviar reporte'; }, 1400);
      }).catch(function () {
        msgEl.style.color = '#DC2626'; msgEl.textContent = 'Não foi possível enviar agora. Tente de novo.';
        enviarEl.disabled = false; enviarEl.textContent = 'Enviar reporte';
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pronto);
  else pronto();
})();
