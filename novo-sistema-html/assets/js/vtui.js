/* Ventus — modal de confirmação + toast (substitui alert/confirm nativos). */
(function () {
  if (window.vtConfirm) return;
  var css = '\
  .vtui-ov{position:fixed;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:18px;z-index:9000;opacity:0;transition:opacity .15s;}\
  .vtui-ov.on{opacity:1;}\
  .vtui-box{background:#fff;border-radius:16px;max-width:400px;width:100%;padding:22px;box-shadow:0 24px 60px -20px rgba(15,23,42,.4);transform:translateY(8px);transition:transform .15s;}\
  .vtui-ov.on .vtui-box{transform:none;}\
  .vtui-box h3{margin:0 0 6px;font-size:17px;font-weight:800;color:#0F172A;}\
  .vtui-box p{margin:0 0 18px;font-size:14px;line-height:1.5;color:#475569;}\
  .vtui-acts{display:flex;gap:10px;justify-content:flex-end;}\
  .vtui-btn{font-size:14px;font-weight:700;padding:10px 16px;border-radius:10px;cursor:pointer;border:1px solid #E2E8F0;background:#fff;color:#334155;font-family:inherit;}\
  .vtui-btn.p{background:#2563EB;color:#fff;border-color:#2563EB;}\
  .vtui-btn.danger{background:#DC2626;color:#fff;border-color:#DC2626;}\
  .vtui-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%) translateY(14px);background:#0F172A;color:#fff;font-size:14px;font-weight:600;padding:12px 18px;border-radius:12px;z-index:9100;opacity:0;transition:opacity .2s,transform .2s;box-shadow:0 14px 34px -12px rgba(0,0,0,.5);max-width:90vw;}\
  .vtui-toast.on{opacity:1;transform:translateX(-50%) translateY(0);}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function esc(s){ return (s==null?'':String(s)).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

  window.vtConfirm = function (message, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var ov = document.createElement('div'); ov.className = 'vtui-ov';
      ov.innerHTML = '<div class="vtui-box" role="dialog" aria-modal="true">'
        + '<h3>' + esc(opts.title || 'Confirmar') + '</h3>'
        + '<p>' + esc(message) + '</p>'
        + '<div class="vtui-acts">'
        + '<button class="vtui-btn" data-no>' + esc(opts.cancel || 'Cancelar') + '</button>'
        + '<button class="vtui-btn ' + (opts.danger ? 'danger' : 'p') + '" data-yes>' + esc(opts.ok || 'Confirmar') + '</button>'
        + '</div></div>';
      document.body.appendChild(ov);
      requestAnimationFrame(function () { ov.classList.add('on'); });
      function close(val) { ov.classList.remove('on'); setTimeout(function () { ov.remove(); }, 160); resolve(val); }
      ov.querySelector('[data-yes]').onclick = function () { close(true); };
      ov.querySelector('[data-no]').onclick = function () { close(false); };
      ov.onclick = function (e) { if (e.target === ov) close(false); };
    });
  };

  window.vtToast = function (message, ms) {
    var t = document.createElement('div'); t.className = 'vtui-toast'; t.textContent = message;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('on'); });
    setTimeout(function () { t.classList.remove('on'); setTimeout(function () { t.remove(); }, 220); }, ms || 2600);
  };
})();
