// Oʻqituvchi pulti: telefon QR-kod orqali ulanadi, toʻgʻri javobni koʻradi va Oʻz oʻyinini boshqaradi.
// Katta ekran bilan bir xil holat ('zk:state') keladi; tugmalar boshlovchi tugmalari bilan bir xil hodisalarni yuboradi.
const socket = io();
const params = new URLSearchParams(location.search);
const pin = params.get('pin');
const token = params.get('k');
let rv = null;

const body = $('#rm-body');
const card = html => `<div class="rm-card">${html}</div>`;
const signed = n => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '±0');
const teamOf = id => rv.teams.find(t => t.id === id);
const chip = id => {
  const t = teamOf(id);
  return t ? `<span class="team-chip t${t.color}">${esc(t.name)}</span>` : '';
};
const results = list => list.map(r => `${chip(r.team)} <b>${signed(r.delta)}</b>`).join(' &nbsp; ');

socket.on('connect', () => {
  socket.emit('zk:remote', { pin, token }, res => {
    if (res && res.error) body.innerHTML = card(`<p class="error">${esc(res.error)}</p>`);
  });
});

socket.on('zk:state', v => {
  rv = v;
  $('#rm-title').textContent = v.title;
  $('#rm-sub').textContent = `PIN ${v.pin} · Oʻqituvchi pulti`;
  $('#rm-scores').innerHTML = v.state === 'lobby' ? '' : v.teams.map(t =>
    `<span class="t${t.color} ${t.id === v.turnId ? 'turn' : ''}">${esc(t.name)} · ${fmt(t.score)}</span>`).join('');
  Translit.markRaw(v.raw, body);
  if (v.kind !== 'board') {
    body.innerHTML = card('<p>Pult hozircha faqat <b>Oʻz oʻyini</b> uchun ishlaydi.</p>');
    return;
  }
  (VIEWS[v.state] || VIEWS.ended)(v);
});

const VIEWS = {
  lobby(v) {
    const n = v.teams.reduce((s, t) => s + t.members.length, 0) + v.unassigned.length;
    body.innerHTML = card(`<div class="rm-tag">Kutish zali</div><p class="rm-q">${n} ta oʻquvchi qoʻshildi</p>
      ${v.teams.map(t => `<div style="margin:6px 0">${chip(t.id)} ${t.members.map(m => esc(m.name)).join(', ') || '<span class="muted">—</span>'}</div>`).join('')}`)
      + `<button class="btn green block" data-ev="zk:start" ${n ? '' : 'disabled'}>${icon('play')} Boshlash</button>`;
  },

  board(v) {
    body.innerHTML = card(`<div class="rm-tag">Navbat</div><p class="rm-q">${chip(v.turnId)} katakcha tanlaydi</p>`)
      + card(`<div class="rm-grid" style="grid-template-columns: 1.3fr repeat(${v.values.length}, 1fr)">
        ${v.topics.map((name, ti) => `<div class="tp">${esc(name)}</div>${v.values.map((val, ci) => {
          const st = v.grid[ti][ci];
          return `<button data-open="${ti},${ci}" ${st.played || st.empty ? 'disabled' : ''}>${val}</button>`;
        }).join('')}`).join('')}</div>`)
      + `<button class="btn ghost block" data-ev="zk:end" data-confirm>${icon('flag')} Oʻyinni yakunlash</button>`;
  },

  question(v) {
    const c = v.cur;
    body.innerHTML = card(`<div class="rm-tag">${esc(c.topic)} · ${c.value}${c.cat ? ' · mushuk qopda' : ''}</div>
        <p class="rm-q">${esc(c.text)}</p>`)
      + `<div class="rm-answer"><small>Toʻgʻri javob</small><b>${esc(c.answer)}</b>${c.comment ? `<small>${esc(c.comment)}</small>` : ''}</div>`
      + card(`<div class="rm-tag">Javob beradi</div><p class="rm-q">${chip(c.answering)}</p>${c.results.length ? `<p>${results(c.results)}</p>` : ''}`)
      + `<div class="rm-btns">
          <button class="btn green" data-verdict="1">${icon('check')} Toʻgʻri</button>
          <button class="btn red" data-verdict="0">${icon('x')} Notoʻgʻri</button>
          <button class="btn ghost wide" data-ev="zk:nobody">Hech kim javob bermadi</button>
        </div>`;
  },

  cat(v) {
    const c = v.cur;
    body.innerHTML = card(`<div class="rm-tag">${esc(c.topic)} · ${c.value}</div><p class="rm-q">${icon('cat')} Mushuk qopda! ${chip(v.turnId)} savolni qaysi jamoaga beradi?</p>`)
      + `<div class="rm-btns">${v.teams.filter(t => t.id !== v.turnId).map(t => `<button class="btn t${t.color}" data-cat="${t.id}">${esc(t.name)}</button>`).join('')}</div>`;
  },

  luck(v) {
    body.innerHTML = card(`<div class="rm-tag">${esc(v.cur.topic)} · ${v.cur.value}</div><p class="rm-q">${icon('gift')} Omad! ${chip(v.turnId)} ${signed(v.cur.value)}</p>`)
      + `<button class="btn brand block" data-ev="zk:next">Davom etish ${icon('next')}</button>`;
  },

  reveal(v) {
    const c = v.cur;
    body.innerHTML = `<div class="rm-answer"><small>${esc(c.topic)} · ${c.value}</small><b>${esc(c.answer)}</b></div>`
      + card(c.results.length ? results(c.results) : 'Hech kim javob bermadi')
      + `<button class="btn brand block" data-ev="zk:next">${icon('grid')} Doskaga qaytish</button>`;
  },

  ended(v) {
    const rows = [...v.teams].sort((a, b) => b.score - a.score);
    body.innerHTML = card(`<div class="rm-tag">Oʻyin tugadi</div>${rows.map((t, i) => `<p class="rm-q">${i + 1}. ${chip(t.id)} ${fmt(t.score)} ball</p>`).join('')}`);
  },
};

body.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  if (b.dataset.confirm !== undefined && !b.dataset.armed) {
    b.dataset.armed = 1;
    b.textContent = 'Aniqmi? Yana bosing';
    return setTimeout(() => rv && VIEWS[rv.state]?.(rv), 3000);
  }
  if (navigator.vibrate) navigator.vibrate(25);
  if (b.dataset.ev) socket.emit(b.dataset.ev);
  if (b.dataset.verdict) socket.emit('zk:verdict', { ok: b.dataset.verdict === '1' });
  if (b.dataset.cat) socket.emit('zk:cat', +b.dataset.cat);
  if (b.dataset.open) {
    const [t, c] = b.dataset.open.split(',').map(Number);
    socket.emit('zk:open', { t, c });
  }
});
