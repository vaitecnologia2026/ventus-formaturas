// Ventus — configuração de ambiente do front.
//
// Local (front + API no mesmo servidor Python): deixe VENTUS_API vazio -> os
// fetch usam caminhos relativos ("/api/...", "/acervo/...").
//
// Produção (front no Vercel, backend no Railway): usa a URL pública do Railway.
// Local (localhost): mantém vazio -> mesmo servidor. Detecção automática:
window.VENTUS_API = window.VENTUS_API || (
  /^(localhost|127\.|0\.0\.0\.0|\[)/.test(location.hostname)
    ? ""
    : "https://ventus-api-production-75c2.up.railway.app"
);

// Helper: monta a URL final respeitando a base acima.
// Uso: fetch(apiUrl('/api/albuns')) e img.src = apiUrl(foto.url)
window.apiUrl = function (caminho) {
  if (/^https?:\/\//.test(caminho)) return caminho;         // já é absoluta
  return (window.VENTUS_API || "").replace(/\/$/, "") + caminho;
};
