// Kunduzgi / tungi rejim. <head> ichida yuklanadi — sahifa oq boʻlib "miltillamasligi" uchun.
// Tanlanmagan boʻlsa, qurilma sozlamasiga (prefers-color-scheme) ergashadi.
(function () {
  const STORE = 'bilimdon-theme';
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  let saved = null;
  try { saved = localStorage.getItem(STORE); } catch {}
  const current = () => saved || (media.matches ? 'dark' : 'light');

  function apply() {
    const t = current();
    document.documentElement.dataset.theme = t;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t === 'dark' ? '#071a33' : '#0b3c6b';
    document.querySelectorAll('.theme-toggle').forEach(b => {
      b.innerHTML = typeof icon === 'function' ? icon(t === 'dark' ? 'sun' : 'moon') : '';
      b.title = t === 'dark' ? 'Kunduzgi rejim' : 'Tungi rejim';
      b.setAttribute('aria-label', b.title);
    });
  }

  apply();
  media.addEventListener('change', apply);
  document.addEventListener('DOMContentLoaded', apply);
  document.addEventListener('click', e => {
    if (!e.target.closest('.theme-toggle')) return;
    saved = current() === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(STORE, saved); } catch {}
    document.documentElement.classList.add('theme-anim');
    apply();
    setTimeout(() => document.documentElement.classList.remove('theme-anim'), 400);
  });
})();
