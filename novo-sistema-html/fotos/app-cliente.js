/* Ventus Fotos — camada do cliente: auth (e-mail+senha), carrinho e checkout.
   Usado por index/turma/resultados/perfil. Depende de config.js (apiUrl). */
(function () {
  "use strict";

  const api = (p) => (window.apiUrl ? window.apiUrl(p) : p);
  const brl = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const PRECO = 24.90;

  /* ----------------------------- Sessão / Auth ----------------------------- */
  const Auth = {
    token: () => localStorage.getItem("ventus_token") || "",
    user: () => { try { return JSON.parse(localStorage.getItem("ventus_user") || "null"); } catch { return null; } },
    logado: () => !!localStorage.getItem("ventus_token"),
    headers() { const t = this.token(); return t ? { Authorization: "Bearer " + t } : {}; },
    salvar(d) { localStorage.setItem("ventus_token", d.token); localStorage.setItem("ventus_user", JSON.stringify({ nome: d.nome, email: d.email })); },
    sair() { localStorage.removeItem("ventus_token"); localStorage.removeItem("ventus_user"); atualizarNav(); },
    async registrar(nome, email, senha) {
      const r = await fetch(api("/api/registrar"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome, email, senha }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.erro || "Falha ao cadastrar."); this.salvar(d); return d;
    },
    async login(email, senha) {
      const r = await fetch(api("/api/login"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, senha }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.erro || "Falha no login."); this.salvar(d); return d;
    },
  };

  /* -------------------------------- Carrinho ------------------------------- */
  const Cart = {
    itens() { try { return JSON.parse(localStorage.getItem("ventus_cart") || "[]"); } catch { return []; } },
    _salvar(l) { localStorage.setItem("ventus_cart", JSON.stringify(l)); disparar(); },
    tem(id) { return this.itens().some((i) => i.foto_id === id); },
    add(item) { if (this.tem(item.foto_id)) return; const l = this.itens(); l.push(item); this._salvar(l); },
    remover(id) { this._salvar(this.itens().filter((i) => i.foto_id !== id)); },
    toggle(item) { this.tem(item.foto_id) ? this.remover(item.foto_id) : this.add(item); },
    limpar() { this._salvar([]); },
    total() { return this.itens().reduce((s, i) => s + (i.preco || PRECO), 0); },
    count() { return this.itens().length; },
  };
  const ouvintes = [];
  function onCart(fn) { ouvintes.push(fn); fn(); }
  function disparar() { ouvintes.forEach((fn) => fn()); atualizarNav(); }

  /* ------------------------------ Nav (topo) ------------------------------- */
  function atualizarNav() {
    document.querySelectorAll("[data-cart-count]").forEach((b) => { b.textContent = Cart.count(); b.hidden = Cart.count() === 0; });
    document.querySelectorAll("[data-auth-link]").forEach((a) => {
      const u = Auth.user();
      a.innerHTML = u
        ? `<i data-lucide="user-round"></i> ${u.nome.split(" ")[0]}`
        : `<i data-lucide="log-in"></i> Entrar`;
      a.setAttribute("href", u ? "perfil.html" : "login.html");
    });
    if (window.lucide) lucide.createIcons();
  }

  /* -------------------------------- Modal ---------------------------------- */
  let modal;
  function garantirModal() {
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "ft-modal";
    modal.innerHTML = '<div class="ft-modal-card" id="vt-modal-card"></div>';
    modal.addEventListener("click", (e) => { if (e.target === modal) fechar(); });
    document.body.appendChild(modal);
    return modal;
  }
  function abrir(html) { const m = garantirModal(); m.querySelector("#vt-modal-card").innerHTML = html; m.classList.add("on"); if (window.lucide) lucide.createIcons(); }
  function fechar() { if (modal) modal.classList.remove("on"); }

  /* ------------------------------- Checkout -------------------------------- */
  async function iniciarCheckout() {
    if (!Cart.count()) return;
    if (!Auth.logado()) return passoAuth();
    passoMetodo();
  }

  function passoAuth(modo) {
    modo = modo || "login";
    const ehLogin = modo === "login";
    abrir(`
      <div class="ft-modal-icon" style="background:var(--gray-100);color:var(--gray-900);"><i data-lucide="user-round"></i></div>
      <h3>${ehLogin ? "Entrar" : "Criar conta"}</h3>
      <p>Para concluir a compra e acessar suas fotos depois.</p>
      <div class="ft-form">
        ${ehLogin ? "" : `<label class="ft-field"><span>Nome completo</span><input id="a-nome" type="text" placeholder="Seu nome" autocomplete="name"></label>`}
        <label class="ft-field"><span>E-mail</span><input id="a-email" type="email" placeholder="voce@email.com" autocomplete="email"></label>
        <label class="ft-field"><span>Senha</span><input id="a-senha" type="password" placeholder="mínimo 6 caracteres" autocomplete="${ehLogin ? "current-password" : "new-password"}"></label>
        <p class="ft-form-erro" id="a-erro" hidden></p>
      </div>
      <button class="ft-btn ft-btn-primary" style="width:100%;" id="a-ok">${ehLogin ? "Entrar" : "Cadastrar"}</button>
      <p style="font-size:13px;margin:12px 0 0;color:var(--gray-500);">
        ${ehLogin ? "Não tem conta?" : "Já tem conta?"}
        <a href="#" id="a-troca" style="color:var(--gray-900);font-weight:600;">${ehLogin ? "Criar agora" : "Entrar"}</a>
      </p>`);
    document.getElementById("a-troca").addEventListener("click", (e) => { e.preventDefault(); passoAuth(ehLogin ? "registro" : "login"); });
    document.getElementById("a-ok").addEventListener("click", async () => {
      const email = document.getElementById("a-email").value.trim();
      const senha = document.getElementById("a-senha").value;
      const nome = ehLogin ? "" : (document.getElementById("a-nome").value || "").trim();
      const erro = document.getElementById("a-erro");
      try {
        if (ehLogin) await Auth.login(email, senha); else await Auth.registrar(nome, email, senha);
        atualizarNav(); passoMetodo();
      } catch (e) { erro.textContent = e.message; erro.hidden = false; }
    });
  }

  function resumoHTML() {
    const itens = Cart.itens();
    const thumbs = itens.slice(0, 4).map((i) => `<img src="${i.url}" alt="">`).join("");
    const mais = itens.length > 4 ? `<span class="vt-more">+${itens.length - 4}</span>` : "";
    return `<div class="vt-resumo">
      <div class="vt-resumo-thumbs">${thumbs || '<span class="vt-more"><i data-lucide="image"></i></span>'}${mais}</div>
      <div class="vt-resumo-info"><strong>${itens.length} foto${itens.length !== 1 ? "s" : ""}</strong><span>alta resolução, sem marca d'água</span></div>
      <div class="vt-resumo-total">${brl(Cart.total())}</div></div>`;
  }
  function steps(ativo) {
    return `<div class="vt-steps">
      <span class="${ativo >= 1 ? "on" : ""}"><b>1</b> Método</span><i></i>
      <span class="${ativo >= 2 ? "on" : ""}"><b>2</b> Pagamento</span></div>`;
  }

  function passoMetodo() {
    abrir(`
      ${steps(1)}
      <h3 class="vt-h">Como você quer pagar?</h3>
      ${resumoHTML()}
      <label class="ft-field" style="margin-bottom:12px;"><span>CPF (para o pagamento)</span><input id="m-cpf" inputmode="numeric" placeholder="000.000.000-00" maxlength="14"></label>
      <div class="vt-metodos">
        <label class="vt-metodo">
          <input type="radio" name="metodo" value="pix" checked>
          <span class="vt-metodo-ic"><i data-lucide="qr-code"></i></span>
          <span class="vt-metodo-tx"><strong>Pix</strong><small>na hora</small></span>
          <i data-lucide="check" class="vt-metodo-chk"></i>
        </label>
        <label class="vt-metodo">
          <input type="radio" name="metodo" value="cartao">
          <span class="vt-metodo-ic"><i data-lucide="credit-card"></i></span>
          <span class="vt-metodo-tx"><strong>Cartão de crédito</strong><small>checkout seguro</small></span>
          <i data-lucide="check" class="vt-metodo-chk"></i>
        </label>
      </div>
      <p class="ft-form-erro" id="m-erro" hidden></p>
      <button class="ft-btn ft-btn-primary vt-btn-full" id="m-ok">Continuar <i data-lucide="arrow-right"></i></button>
      <p class="vt-secure"><i data-lucide="shield-check"></i> Pagamento seguro via Asaas</p>`);
    const cpfEl = document.getElementById("m-cpf");
    cpfEl.addEventListener("input", () => {
      let v = cpfEl.value.replace(/\D/g, "").slice(0, 11);
      if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, "$1.$2.$3-$4");
      else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, "$1.$2.$3");
      else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, "$1.$2");
      cpfEl.value = v;
    });
    document.getElementById("m-ok").addEventListener("click", () => {
      const cpf = cpfEl.value.replace(/\D/g, "");
      const erro = document.getElementById("m-erro");
      if (cpf.length !== 11) { erro.textContent = "Informe um CPF válido (11 dígitos)."; erro.hidden = false; return; }
      const metodo = modal.querySelector('input[name="metodo"]:checked').value;
      metodo === "pix" ? passoPix(cpf) : passoCartao(cpf);
    });
  }

  async function criarPedido(cpf, metodo) {
    const u = Auth.user() || {};
    const ids = Cart.itens().map((i) => i.foto_id);
    const r = await fetch(api("/api/pedido"), { method: "POST", headers: { "Content-Type": "application/json", ...Auth.headers() }, body: JSON.stringify({ fotos: ids, nome: u.nome, email: u.email, cpf, metodo }) });
    const d = await r.json(); if (!r.ok) throw new Error(d.detail || d.erro || "Falha ao gerar o pedido."); return d;
  }

  function carregando(txt) {
    abrir(`<div class="ft-modal-icon" style="background:var(--gray-100);color:var(--gray-900);"><span class="ft-spinner ft-spinner-lg"></span></div><h3>${txt}</h3><p>Só um instante.</p>`);
  }

  async function passoPix(cpf) {
    carregando("Gerando Pix…");
    let ped; try { ped = await criarPedido(cpf, "pix"); } catch (e) { return erroModal(e.message); }
    const qr = ped.pix_qrcode ? `<img src="data:image/png;base64,${ped.pix_qrcode}" alt="QR Pix">` : `<i data-lucide="qr-code" class="vt-qr-ph"></i>`;
    abrir(`
      ${steps(2)}
      <h3 class="vt-h">Pague com Pix</h3>
      ${resumoHTML()}
      <div class="vt-qrbox">${qr}</div>
      <p class="vt-hint">Abra o app do seu banco, escaneie o QR ou use o copia e cola:</p>
      <div class="vt-copy"><code id="pix-code">${ped.pix_copia_cola || "—"}</code><button id="p-copy" title="Copiar"><i data-lucide="copy"></i></button></div>
      <button class="ft-btn ft-btn-primary vt-btn-full" id="p-ok"><i data-lucide="check"></i> Já paguei — liberar fotos</button>
      <p class="vt-hint" id="p-status" style="text-align:center;margin-top:8px;"></p>`);
    document.getElementById("p-copy").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(ped.pix_copia_cola || ""); } catch (e) {}
      const b = document.getElementById("p-copy"); b.innerHTML = '<i data-lucide="check"></i>'; if (window.lucide) lucide.createIcons();
    });
    document.getElementById("p-ok").addEventListener("click", () => finalizar(ped, "pix"));
    iniciarPolling(ped, "pix");
  }

  async function passoCartao(cpf) {
    carregando("Abrindo checkout…");
    let ped; try { ped = await criarPedido(cpf, "cartao"); } catch (e) { return erroModal(e.message); }
    if (ped.url) { try { window.open(ped.url, "_blank"); } catch (e) {} }
    abrir(`
      ${steps(2)}
      <h3 class="vt-h">Pagar no cartão</h3>
      ${resumoHTML()}
      <p class="vt-hint">Abrimos o checkout seguro do Asaas em outra aba para você pagar ${brl(ped.total)} no cartão. Se não abriu, use o botão:</p>
      ${ped.url ? `<a class="ft-btn ft-btn-primary vt-btn-full" href="${ped.url}" target="_blank"><i data-lucide="external-link"></i> Abrir checkout do cartão</a>` : ""}
      <button class="ft-btn ft-btn-secondary vt-btn-full" id="p-ok" style="margin-top:8px;"><i data-lucide="check"></i> Já paguei — liberar fotos</button>
      <p class="vt-hint" id="p-status" style="text-align:center;margin-top:8px;"></p>`);
    document.getElementById("p-ok").addEventListener("click", () => finalizar(ped, "cartao"));
    iniciarPolling(ped, "cartao");
  }

  let _pollTimer = null;
  function iniciarPolling(ped, metodo) {
    let tentativas = 0;
    clearInterval(_pollTimer);
    _pollTimer = setInterval(async () => {
      if (++tentativas > 36) { clearInterval(_pollTimer); return; }  // ~3 min
      try {
        const r = await fetch(api("/api/pagar"), { method: "POST", headers: { "Content-Type": "application/json", ...Auth.headers() }, body: JSON.stringify({ pedido_id: ped.pedido_id, metodo }) });
        const d = await r.json();
        if (d.pago && document.getElementById("p-ok")) { clearInterval(_pollTimer); telaSucesso(d); }
      } catch (e) {}
    }, 5000);
  }

  async function finalizar(ped, metodo) {
    const st = document.getElementById("p-status");
    if (st) st.textContent = "Verificando pagamento…";
    let d; try {
      const r = await fetch(api("/api/pagar"), { method: "POST", headers: { "Content-Type": "application/json", ...Auth.headers() }, body: JSON.stringify({ pedido_id: ped.pedido_id, metodo }) });
      d = await r.json(); if (!r.ok) throw new Error(d.detail || d.erro || "Falha no pagamento.");
    } catch (e) { if (st) st.textContent = ""; return erroModal(e.message); }
    if (!d.pago) { if (st) st.textContent = "Pagamento ainda não identificado. Assim que cair, suas fotos liberam automaticamente."; return; }
    clearInterval(_pollTimer);
    telaSucesso(d);
  }

  function telaSucesso(d) {
    Cart.limpar();
    abrir(`
      <div class="vt-ok-badge"><i data-lucide="check"></i></div>
      <h3 class="vt-h" style="text-align:center;">Pagamento aprovado!</h3>
      <p style="text-align:center;">Suas fotos em alta, <strong>sem marca d'água</strong>. Já ficaram salvas no seu perfil.</p>
      <div class="vt-downloads">
      ${(d.downloads || []).map((x) => `<a class="vt-dl" href="${api(x.url)}" download><i data-lucide="download"></i> ${x.arquivo || x.foto_id}</a>`).join("")}
      </div>
      <a class="ft-btn ft-btn-primary vt-btn-full" href="perfil.html"><i data-lucide="images"></i> Ver minhas fotos</a>`);
  }

  function erroModal(msg) {
    abrir(`<div class="ft-modal-icon" style="background:#FEF3C7;color:#92400E;"><i data-lucide="info"></i></div><h3>Ops…</h3><p>${msg}</p><button class="ft-btn ft-btn-primary" style="width:100%;" id="e-ok">Entendi</button>`);
    document.getElementById("e-ok").addEventListener("click", fechar);
  }

  /* ------------------------------- Exporta --------------------------------- */
  window.Ventus = { Auth, Cart, onCart, atualizarNav, iniciarCheckout, abrirCheckout: iniciarCheckout, brl, api, PRECO, fecharModal: fechar, passoAuth };
  document.addEventListener("DOMContentLoaded", atualizarNav);
})();
