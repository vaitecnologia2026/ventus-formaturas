/* Ventus Fotos — utilidades compartilhadas da área do cliente */

// Rolagem suave para âncoras internas (#albuns, #faq...)
document.addEventListener('click', (ev) => {
  const link = ev.target.closest('a[href^="#"]');
  if (!link) return;
  const alvo = document.querySelector(link.getAttribute('href'));
  if (alvo) {
    ev.preventDefault();
    alvo.scrollIntoView({ behavior: 'smooth' });
  }
});
