/* =====================================================================
 * Padrao LP — JS de interações da landing comercial
 * Null-safe: cada bloco verifica existência antes de operar
 * ===================================================================== */
(function () {
  'use strict';

  // ===== Mobile menu =====
  window.toggleMenu = function () {
    var m = document.getElementById('mobileMenu');
    if (m) m.classList.toggle('open');
  };

  // ===== Header com sombra ao rolar (só se header.top existir) =====
  var headerEl = document.querySelector('header.top');
  if (headerEl) {
    window.addEventListener('scroll', function () {
      headerEl.style.boxShadow = window.scrollY > 20 ? 'var(--shadow-md)' : 'none';
    });
  }

  // ===== Reveal on scroll =====
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });
    document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
  }

  // ===== Login modal (opcional — só ativa se o modal existir) =====
  var loginModal = document.getElementById('loginModal');
  if (loginModal) {
    window.abrirLogin = function (e) {
      if (e) e.preventDefault();
      loginModal.classList.add('open');
      document.body.style.overflow = 'hidden';
    };
    window.fecharLogin = function () {
      loginModal.classList.remove('open');
      document.body.style.overflow = '';
    };
    window.trocarTab = function (btn, qual) {
      document.querySelectorAll('.login-tab').forEach(function (t) { t.classList.remove('active'); });
      btn.classList.add('active');
      var fa = document.getElementById('form-aluno');
      var fad = document.getElementById('form-admin');
      if (fa)  fa.style.display  = qual === 'aluno' ? 'block' : 'none';
      if (fad) fad.style.display = qual === 'admin' ? 'block' : 'none';
    };
    window.entrarAluno = function () { window.location.href = 'acesso/aluno.html'; };
    window.entrarAdmin = function () { window.location.href = 'acesso/equipe.html'; };
  }

  // ===== Orçamento modal (opcional — só ativa se o modal existir) =====
  var orcaModal = document.getElementById('orcaModal');
  if (orcaModal) {
    var orcaData = { nome: '', data: '', escola: '' };

    window.abrirOrca = function (e) {
      if (e) e.preventDefault();
      orcaModal.classList.add('open');
      document.body.style.overflow = 'hidden';
      orcaIrParaStep(1);
      var nomeInput = document.getElementById('orca-nome');
      if (nomeInput) setTimeout(function () { nomeInput.focus(); }, 350);
    };
    window.fecharOrca = function () {
      orcaModal.classList.remove('open');
      document.body.style.overflow = '';
    };

    function orcaIrParaStep(step) {
      document.querySelectorAll('.orca-step').forEach(function (s) { s.classList.remove('active'); });
      var stepEl = document.querySelector('.orca-step[data-step="' + step + '"]');
      if (stepEl) stepEl.classList.add('active');
      document.querySelectorAll('#orcaProgress .orca-dot').forEach(function (d, idx) {
        d.classList.remove('active', 'done');
        if (idx + 1 < step && step <= 3) d.classList.add('done');
        if (idx + 1 === step && step <= 3) d.classList.add('active');
        if (step === 4) d.classList.add('done');
      });
    }
    function orcaShowError(field, msg) {
      var input = document.getElementById('orca-' + field);
      var err = document.getElementById('orca-erro-' + field);
      if (input) input.classList.add('error');
      if (err) err.textContent = msg;
    }
    function orcaClearError(field) {
      var input = document.getElementById('orca-' + field);
      var err = document.getElementById('orca-erro-' + field);
      if (input) input.classList.remove('error');
      if (err) err.textContent = '';
    }
    window.orcaNext = function (step) {
      if (step === 1) {
        var nome = (document.getElementById('orca-nome').value || '').trim();
        if (nome.length < 2) return orcaShowError('nome', 'Conta pra gente como te chamar :)');
        orcaData.nome = nome;
        var sau = document.getElementById('orca-saudacao');
        if (sau) sau.textContent = nome.split(' ')[0];
        orcaClearError('nome');
        orcaIrParaStep(2);
        setTimeout(function () { var d = document.getElementById('orca-data'); if (d) d.focus(); }, 200);
      } else if (step === 2) {
        var data = document.getElementById('orca-data').value;
        if (!data) return orcaShowError('data', 'Escolha o mês previsto da formatura.');
        orcaData.data = data;
        orcaClearError('data');
        orcaIrParaStep(3);
        setTimeout(function () { var s = document.getElementById('orca-escola'); if (s) s.focus(); }, 200);
      }
    };
    window.orcaBack = function (step) { orcaIrParaStep(step - 1); };
    window.orcaSubmit = function () {
      var escola = (document.getElementById('orca-escola').value || '').trim();
      if (escola.length < 2) return orcaShowError('escola', 'Diga em qual faculdade ou escola você está se formando.');
      orcaData.escola = escola;
      orcaClearError('escola');
      var fn = document.getElementById('orca-final-nome');
      if (fn) fn.textContent = orcaData.nome.split(' ')[0];
      orcaIrParaStep(4);
    };
  }

  // ===== Keyboard handlers (null-safe) =====
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (loginModal && loginModal.classList.contains('open')) window.fecharLogin();
      if (orcaModal && orcaModal.classList.contains('open')) window.fecharOrca();
    }
    if (e.key === 'Enter' && orcaModal && orcaModal.classList.contains('open')) {
      e.preventDefault();
      var stepAtual = (document.querySelector('.orca-step.active') || {}).dataset;
      stepAtual = stepAtual && stepAtual.step;
      if (stepAtual === '1' || stepAtual === '2') window.orcaNext(parseInt(stepAtual));
      else if (stepAtual === '3') window.orcaSubmit();
    }
  });
})();
