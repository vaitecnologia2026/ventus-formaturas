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
      <div class="vt-metodos">
        <label class="vt-metodo">
          <input type="radio" name="metodo" value="pix" checked>
          <span class="vt-metodo-ic"><i data-lucide="qr-code"></i></span>
          <span class="vt-metodo-tx"><strong>Pix</strong><small>aprovação na hora</small></span>
          <i data-lucide="check" class="vt-metodo-chk"></i>
        </label>
        <label class="vt-metodo">
          <input type="radio" name="metodo" value="cartao">
          <span class="vt-metodo-ic"><i data-lucide="credit-card"></i></span>
          <span class="vt-metodo-tx"><strong>Cartão de crédito</strong><small>à vista</small></span>
          <i data-lucide="check" class="vt-metodo-chk"></i>
        </label>
      </div>
      <button class="ft-btn ft-btn-primary vt-btn-full" id="m-ok">Continuar <i data-lucide="arrow-right"></i></button>
      <p class="vt-secure"><i data-lucide="shield-check"></i> Ambiente de pagamento seguro</p>`);
    document.getElementById("m-ok").addEventListener("click", () => {
      const metodo = modal.querySelector('input[name="metodo"]:checked').value;
      metodo === "pix" ? passoPix() : passoCartao();
    });
  }

  async function criarPedido() {
    const u = Auth.user() || {};
    const ids = Cart.itens().map((i) => i.foto_id);
    const r = await fetch(api("/api/pedido"), { method: "POST", headers: { "Content-Type": "application/json", ...Auth.headers() }, body: JSON.stringify({ fotos: ids, nome: u.nome, email: u.email }) });
    const d = await r.json(); if (!r.ok) throw new Error(d.erro || "Falha ao gerar o pedido."); return d;
  }

  function carregando(txt) {
    abrir(`<div class="ft-modal-icon" style="background:var(--gray-100);color:var(--gray-900);"><span class="ft-spinner ft-spinner-lg"></span></div><h3>${txt}</h3><p>Só um instante.</p>`);
  }

  async function passoPix() {
    carregando("Gerando Pix…");
    let ped; try { ped = await criarPedido(); } catch (e) { return erroModal(e.message); }
    const qr = ped.pix_qrcode ? `<img src="data:image/png;base64,${ped.pix_qrcode}" alt="QR Pix">` : `<i data-lucide="qr-code" class="vt-qr-ph"></i>`;
    abrir(`
      ${steps(2)}
      <h3 class="vt-h">Pague com Pix</h3>
      ${resumoHTML()}
      <div class="vt-qrbox">${qr}</div>
      <p class="vt-hint">Abra o app do seu banco, escaneie o QR ou use o copia e cola:</p>
      <div class="vt-copy"><code id="pix-code">${ped.pix_copia_cola || "—"}</code><button id="p-copy" title="Copiar"><i data-lucide="copy"></i></button></div>
      <button class="ft-btn ft-btn-primary vt-btn-full" id="p-ok"><i data-lucide="check"></i> Já paguei — confirmar</button>
      <p class="vt-sim"><i data-lucide="info"></i> Pagamento simulado — a venda é aprovada na hora nesta versão.</p>`);
    document.getElementById("p-copy").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(ped.pix_copia_cola || ""); } catch (e) {}
      const b = document.getElementById("p-copy"); b.innerHTML = '<i data-lucide="check"></i>'; if (window.lucide) lucide.createIcons();
    });
    document.getElementById("p-ok").addEventListener("click", () => finalizar(ped, "pix"));
  }

  async function passoCartao() {
    carregando("Abrindo checkout…");
    let ped; try { ped = await criarPedido(); } catch (e) { return erroModal(e.message); }
    abrir(`
      ${steps(2)}
      <h3 class="vt-h">Cartão de crédito</h3>
      <div class="vt-cc" id="cc">
        <div class="vt-cc-top"><span class="vt-cc-chip"></span><span class="vt-cc-brand">VENTUS</span></div>
        <div class="vt-cc-num" id="cc-num-view">•••• •••• •••• ••••</div>
        <div class="vt-cc-row"><div><small>TITULAR</small><div id="cc-nome-view">NOME NO CARTÃO</div></div><div><small>VALIDADE</small><div id="cc-val-view">MM/AA</div></div></div>
      </div>
      <div class="ft-form" style="margin-top:16px;">
        <label class="ft-field"><span>Número do cartão</span><input id="c-num" inputmode="numeric" placeholder="0000 0000 0000 0000" autocomplete="cc-number"></label>
        <label class="ft-field"><span>Nome no cartão</span><input id="c-nome" placeholder="Como impresso" autocomplete="cc-name"></label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <label class="ft-field"><span>Validade</span><input id="c-val" placeholder="MM/AA" inputmode="numeric" autocomplete="cc-exp"></label>
          <label class="ft-field"><span>CVV</span><input id="c-cvv" inputmode="numeric" placeholder="123" maxlength="4" autocomplete="cc-csc"></label>
        </div>
        <p class="ft-form-erro" id="c-erro" hidden></p>
      </div>
      <button class="ft-btn ft-btn-primary vt-btn-full" id="c-ok"><i data-lucide="lock"></i> Pagar ${brl(ped.total)}</button>
      <p class="vt-sim"><i data-lucide="info"></i> Pagamento simulado — não use dados reais.</p>`);
    const num = document.getElementById("c-num"), nome = document.getElementById("c-nome"), val = document.getElementById("c-val");
    const upd = () => {
      const raw = num.value.replace(/\D/g, "");
      document.getElementById("cc-num-view").textContent = (raw + "•".repeat(Math.max(0, 16 - raw.length))).replace(/(.{4})/g, "$1 ").trim();
      document.getElementById("cc-nome-view").textContent = (nome.value || "NOME NO CARTÃO").toUpperCase();
      document.getElementById("cc-val-view").textContent = val.value || "MM/AA";
    };
    num.addEventListener("input", () => { num.value = num.value.replace(/\D/g, "").slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 "); upd(); });
    val.addEventListener("input", () => { val.value = val.value.replace(/\D/g, "").slice(0, 4).replace(/(\d{2})(?=\d)/, "$1/"); upd(); });
    nome.addEventListener("input", upd);
    document.getElementById("c-ok").addEventListener("click", () => {
      const erro = document.getElementById("c-erro");
      if (num.value.replace(/\D/g, "").length < 13 || !nome.value.trim() || val.value.length < 5) { erro.textContent = "Preencha os dados do cartão (fictícios)."; erro.hidden = false; return; }
      finalizar(ped, "cartao");
    });
  }

  async function finalizar(ped, metodo) {
    carregando("Aprovando pagamento…");
    let d; try {
      const r = await fetch(api("/api/pagar"), { method: "POST", headers: { "Content-Type": "application/json", ...Auth.headers() }, body: JSON.stringify({ pedido_id: ped.pedido_id, metodo }) });
      d = await r.json(); if (!r.ok) throw new Error(d.erro || "Falha no pagamento.");
    } catch (e) { return erroModal(e.message); }
    if (!d.pago) return erroModal("Pagamento não confirmado. Tente de novo.");
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
