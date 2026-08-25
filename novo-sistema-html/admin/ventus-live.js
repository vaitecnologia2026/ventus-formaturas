/* CRM Ventus — análise de vendas REAL (ao vivo) com filtros por turma e período.
   Dashboard: painel de KPIs + gráfico + tabela por turma, tudo filtrável.
   Turmas: lista de turmas publicadas. Depende de config.js (apiUrl) e, no
   dashboard, de Chart.js (já carregado lá). Falha em silêncio se a API cair. */
(function () {
  "use strict";
  const api = (p) => (window.apiUrl ? window.apiUrl(p) : p);
  const page = (location.pathname.split("/").pop() || "").toLowerCase();
  const brl0 = (n) => "R$ " + Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  const brl2 = (n) => "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  document.addEventListener("DOMContentLoaded", () => {
    if (page === "dashboard.html") dashboard();
    if (page === "turmas.html") turmas();
  });

  const topo = (main, el) => main.insertBefore(el, main.children[1] || null);

  async function dashboard() {
    try {
      const [rv, ra] = await Promise.all([fetch(api("/api/vendas")), fetch(api("/api/albuns")).catch(() => null)]);
      if (!rv.ok) return;
      const V = await rv.json();
      const turmas = ra && ra.ok ? (await ra.json()).albuns : [];
      const nomeDe = Object.fromEntries(turmas.map((t) => [t.id, t.nome]));
      const vendas = V.vendas || [];
      const main = document.querySelector(".app-content"); if (!main) return;

      const card = document.createElement("div");
      card.className = "card"; card.style.marginBottom = "24px";
      card.innerHTML = `
        <div class="card-header" style="flex-wrap:wrap;gap:12px;">
          <div class="card-title"><i data-lucide="scan-face" style="width:16px;height:16px;vertical-align:-3px;"></i> Análise de vendas · reconhecimento facial <span class="badge badge-success" style="margin-left:6px;">ao vivo</span></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <select class="select" id="lv-periodo" style="width:auto;">
              <option value="0">Todo o período</option>
              <option value="7">Últimos 7 dias</option>
              <option value="30" selected>Últimos 30 dias</option>
              <option value="90">Últimos 90 dias</option>
            </select>
            <select class="select" id="lv-turma" style="width:auto;">
              <option value="">Todas as turmas</option>
              ${turmas.map((t) => `<option value="${t.id}">${t.nome}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="card-body">
          <div class="grid grid-cols-4 gap-4" id="lv-kpis" style="margin-bottom:20px;"></div>
          <div style="display:grid;grid-template-columns:2fr 1fr;gap:20px;" id="lv-cols">
            <div><canvas id="lv-chart" height="150"></canvas></div>
            <div id="lv-metodos"></div>
          </div>
          <div style="margin-top:8px;" id="lv-turmas"></div>
        </div>`;
      topo(main, card);
      if (window.lucide) lucide.createIcons();

      let chart = null;
      const kpi = (l, v) => `<div><div class="kpi-label">${l}</div><div class="kpi-value" style="font-size:26px;">${v}</div></div>`;

      function aplicar() {
        const dias = parseInt(document.getElementById("lv-periodo").value, 10);
        const turma = document.getElementById("lv-turma").value;
        const corte = dias ? Date.now() / 1000 - dias * 86400 : 0;
        const f = vendas.filter((v) => v.ts >= corte && (!turma || (v.turmas || []).includes(turma)));

        const receita = f.reduce((s, v) => s + v.total, 0);
        const fotos = f.reduce((s, v) => s + v.qtd_fotos, 0);
        document.getElementById("lv-kpis").innerHTML =
          kpi("Receita", brl0(receita)) + kpi("Vendas", f.length) +
          kpi("Fotos vendidas", fotos) + kpi("Ticket médio", f.length ? brl2(receita / f.length) : "R$ 0,00");

        // série por dia
        const nDias = dias || 30;
        const labels = [], data = [];
        for (let i = nDias - 1; i >= 0; i--) {
          const d = new Date(Date.now() - i * 86400000);
          const key = d.toISOString().slice(0, 10);
          labels.push(d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }));
          data.push(f.filter((v) => (v.data || "").slice(0, 10) === key).reduce((s, v) => s + v.total, 0));
        }
        if (chart) chart.destroy();
        chart = new Chart(document.getElementById("lv-chart"), {
          type: "line",
          data: { labels, datasets: [{ label: "Receita (R$)", data, borderColor: "#2563EB", backgroundColor: "rgba(37,99,235,.12)", fill: true, tension: .35, pointRadius: 2 }] },
          options: { plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { callback: (v) => "R$ " + v } } } },
        });

        // por método
        const met = {};
        f.forEach((v) => { met[v.metodo] = (met[v.metodo] || 0) + v.total; });
        document.getElementById("lv-metodos").innerHTML =
          `<div class="kpi-label" style="margin-bottom:10px;">Por método</div>` +
          (Object.keys(met).length ? Object.entries(met).map(([m, tot]) =>
            `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--gray-100);font-size:13.5px;"><span style="text-transform:capitalize;"><span class="badge">${m}</span></span><strong>${brl2(tot)}</strong></div>`).join("")
            : '<p style="color:var(--gray-500);font-size:13px;">Sem vendas no período.</p>');

        // por turma
        const pt = {};
        f.forEach((v) => (v.turmas || []).forEach((t) => { pt[t] = pt[t] || { vendas: 0, receita: 0 }; pt[t].vendas++; pt[t].receita += v.total; }));
        const linhas = Object.entries(pt).sort((a, b) => b[1].receita - a[1].receita);
        document.getElementById("lv-turmas").innerHTML = linhas.length ? `
          <div class="divider"></div>
          <table class="table" style="margin:-8px 0;"><thead><tr><th>Turma</th><th class="num">Vendas</th><th class="num">Receita</th></tr></thead>
          <tbody>${linhas.map(([id, s]) => `<tr><td><strong>${nomeDe[id] || id}</strong></td><td class="num">${s.vendas}</td><td class="num">${brl2(s.receita)}</td></tr>`).join("")}</tbody></table>` : "";
      }
      document.getElementById("lv-periodo").addEventListener("change", aplicar);
      document.getElementById("lv-turma").addEventListener("change", aplicar);
      aplicar();
    } catch (e) {}
  }

  async function turmas() {
    try {
      const r = await fetch(api("/api/turmas"));
      if (!r.ok) return;
      const { turmas } = await r.json();
      if (!turmas || !turmas.length) return;
      const main = document.querySelector(".app-content"); if (!main) return;
      const card = document.createElement("div");
      card.className = "card"; card.style.marginBottom = "24px";
      card.innerHTML = `
        <div class="card-header"><div class="card-title">Turmas publicadas no site (ao vivo)</div><span class="badge badge-success">${turmas.length}</span></div>
        <table class="table"><thead><tr><th>Turma</th><th class="num">Fotos</th><th>Criada</th><th></th></tr></thead>
          <tbody>${turmas.map((t) => `<tr><td><strong>${t.nome}</strong></td><td class="num">${t.total_fotos}</td><td>${t.criado_em}</td>
            <td class="num"><a href="galerias.html" style="color:var(--primary-600);font-weight:600;text-decoration:none;">gerenciar →</a></td></tr>`).join("")}</tbody></table>`;
      topo(main, card);
    } catch (e) {}
  }
})();
