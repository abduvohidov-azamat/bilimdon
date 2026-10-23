// Lotin ↔ Kirill: butun sahifa matnini (viktorina savollari ham) koʻruvchi tanlagan yozuvda koʻrsatadi.
// Asl matn oʻzgarmaydi — faqat ekranda oʻgiriladi. data-raw belgisi bor joylar (masalan, rus yoki
// ingliz tilidagi viktorinalar) oʻgirilmaydi.
(function () {
  const STORE = 'bilimdon-script';
  const isUpper = c => c !== c.toLowerCase();
  const caseLike = (src, out) => (isUpper(src) ? out.toUpperCase() : out);

  // ---------- Lotin → Kirill ----------
  const L2C = {
    a: 'а', b: 'б', d: 'д', f: 'ф', g: 'г', h: 'ҳ', i: 'и', j: 'ж', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о',
    p: 'п', q: 'қ', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', x: 'х', y: 'й', z: 'з',
  };
  const APOS = /[ʻʼ'‘’`]/;
  const CYR_VOWELS = 'аэиоуўеёюя';

  function wordToCyr(w) {
    let out = '';
    for (let i = 0; i < w.length; i++) {
      const c = w[i];
      const l = c.toLowerCase();
      const next = (w[i + 1] || '').toLowerCase();
      const prev = out.slice(-1).toLowerCase();
      if (l === 's' && next === 'h') { out += caseLike(c, 'ш'); i++; continue; }
      if (l === 'c' && next === 'h') { out += caseLike(c, 'ч'); i++; continue; }
      if (l === 'o' && APOS.test(w[i + 1] || '')) { out += caseLike(c, 'ў'); i++; continue; }
      if (l === 'g' && APOS.test(w[i + 1] || '')) { out += caseLike(c, 'ғ'); i++; continue; }
      if (l === 'y' && next && 'oaue'.includes(next)) { out += caseLike(c, { o: 'ё', a: 'я', u: 'ю', e: 'е' }[next]); i++; continue; }
      if (l === 'e') { out += caseLike(c, i === 0 || CYR_VOWELS.includes(prev) ? 'э' : 'е'); continue; }
      if (APOS.test(c)) { out += i === 0 || i === w.length - 1 ? c : 'ъ'; continue; }
      out += L2C[l] ? caseLike(c, L2C[l]) : c;
    }
    return out;
  }

  // Lotincha qoladigan qisqartmalar
  const KEEP = new Set(['QR', 'CSV', 'JSON', 'PNG', 'JPG', 'GIF', 'WEBP', 'MB', 'Email', 'email']);
  function toCyr(text) {
    if (!/[A-Za-z]/.test(text)) return text;
    return text.replace(/\S+/g, chunk => {
      if (/https?:|www\.|@|\.(com|uz|ru|org|net)\b/i.test(chunk)) return chunk; // havola, email
      if (/[A-Za-z][0-9₀-₉⁰-⁹]|[0-9₀-₉⁰-⁹][A-Za-z]/.test(chunk)) return chunk; // formulalar: H₂O, CO2
      return chunk.replace(/[A-Za-zʻʼ'‘’`]+/g, w => {
        // NaCl kabi formulalar va inglizcha soʻzlar (oʻzbek lotin alifbosida c va w yoʻq)
        if (KEEP.has(w) || /[a-z][A-Z]/.test(w) || /c|w/i.test(w.replace(/ch/gi, ''))) return w;
        return wordToCyr(w);
      });
    });
  }

  // ---------- Kirill → Lotin ----------
  const C2L = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n',
    о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh',
    ъ: 'ʼ', ы: 'i', ь: '', э: 'e', ё: 'yo', ю: 'yu', я: 'ya', ў: 'oʻ', қ: 'q', ғ: 'gʻ', ҳ: 'h',
  };
  const CYR_RUN = /[А-яЁёЎўҚқҒғҲҳ]+/g;
  function toLat(text) {
    if (!/[А-яЁёЎўҚқҒғҲҳ]/.test(text)) return text;
    return text.replace(CYR_RUN, w => {
      let out = '';
      for (let i = 0; i < w.length; i++) {
        const c = w[i];
        const l = c.toLowerCase();
        let r = l === 'е' ? (i === 0 || CYR_VOWELS.includes(w[i - 1].toLowerCase()) ? 'ye' : 'e') : C2L[l] ?? c;
        if (isUpper(c) && r) {
          const allCaps = (w[i + 1] && isUpper(w[i + 1])) || (i > 0 && isUpper(w[i - 1]) && !w[i + 1]);
          r = allCaps ? r.toUpperCase() : r[0].toUpperCase() + r.slice(1);
        }
        out += r;
      }
      return out;
    });
  }

  // Serverda (Node) — faqat oʻgirish funksiyalari kerak (Zakovat javoblarini solishtirish uchun)
  if (typeof module === 'object' && module.exports) {
    module.exports = { toCyr, toLat };
    return;
  }

  // ---------- Sahifaga qoʻllash ----------
  let mode = 'lat';
  try { mode = localStorage.getItem(STORE) === 'cyr' ? 'cyr' : 'lat'; } catch {}
  const convert = s => (mode === 'cyr' ? toCyr(s) : toLat(s));

  const textRec = new WeakMap(); // matn tuguni → { src, out }
  const attrRec = new WeakMap(); // element → { attr: { src, out } }
  const ATTRS = ['placeholder', 'title', 'alt'];
  const excluded = el => !el || el.closest('script, style, textarea, input, [data-raw], .script-toggle');

  function convertText(node) {
    if (excluded(node.parentElement)) return;
    const rec = textRec.get(node);
    const cur = node.nodeValue;
    const src = rec && cur === rec.out ? rec.src : cur;
    const out = convert(src);
    textRec.set(node, { src, out });
    if (cur !== out) node.nodeValue = out;
  }
  function convertAttrs(el) {
    if (el.closest('script, style, [data-raw], .script-toggle')) return;
    const recs = attrRec.get(el) || {};
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const cur = el.getAttribute(a);
      const src = recs[a] && cur === recs[a].out ? recs[a].src : cur;
      const out = convert(src);
      recs[a] = { src, out };
      if (cur !== out) el.setAttribute(a, out);
    }
    attrRec.set(el, recs);
  }
  function walk(root) {
    if (root.nodeType === 3) return convertText(root);
    if (root.nodeType !== 1) return;
    if (root.matches('[placeholder], [title], [alt]')) convertAttrs(root);
    root.querySelectorAll('[placeholder], [title], [alt]').forEach(convertAttrs);
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = tw.nextNode())) convertText(n);
  }

  const docTitle = document.title;
  const observer = new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === 'characterData') convertText(m.target);
      else if (m.type === 'attributes') convertAttrs(m.target);
      else m.addedNodes.forEach(walk);
    }
  });

  function apply() {
    observer.disconnect();
    walk(document.body);
    document.title = convert(docTitle);
    document.documentElement.lang = mode === 'cyr' ? 'uz-Cyrl' : 'uz';
    document.querySelectorAll('.script-toggle').forEach(b => {
      (b.querySelector('.lbl') || b).textContent = mode === 'cyr' ? 'Lotin' : 'Кирилл';
      b.title = mode === 'cyr' ? 'Lotin yozuviga oʻtish' : 'Кирилл ёзувига ўтиш';
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  function setMode(m) {
    mode = m;
    try { localStorage.setItem(STORE, m); } catch {}
    apply();
  }

  document.addEventListener('click', e => {
    if (e.target.closest('.script-toggle')) setMode(mode === 'cyr' ? 'lat' : 'cyr');
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();

  // Boshqa tildagi viktorina matni joylashadigan elementlarni belgilash
  function markRaw(raw, ...els) {
    for (const el of els) if (el) raw ? el.setAttribute('data-raw', '') : el.removeAttribute('data-raw');
  }
  window.Translit = { toCyr, toLat, setMode, markRaw, get mode() { return mode; } };
})();
