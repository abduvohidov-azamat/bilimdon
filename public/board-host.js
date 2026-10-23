// Oʻz oʻyini — boshlovchi (oʻqituvchi) tomoni: doska muharriri, oʻyinni ochish va katta ekran.
// Kutish zali umumiy (zk-host.js). Server holati 'zk:state' orqali keladi.

// =================== MUHARRIR ===================

const blankCell = () => ({ text: '', image: '', answer: '', comment: '', special: '' });
const blankTopic = n => ({ name: '', cells: Array.from({ length: n }, blankCell) });
function blankBoard() {
  const values = [100, 200, 300, 400, 500];
  return { title: '', description: '', mode: 'board', values, topics: [0, 1, 2].map(() => blankTopic(values.length)) };
}
const MAX_TOPICS = 6;
const SPECIALS = [['', 'Oddiy savol'], ['cat', 'Mushuk qopda'], ['luck', 'Omad — savolsiz ball']];

function cellEditor(c, ci) {
  const luck = c.special === 'luck';
  const value = draft.values[ci];
  return `
    <div class="bd-ed-cell ${c.special}" data-c="${ci}">
      <div class="bd-ed-val">${value}</div>
      <div class="bd-ed-body">
        ${luck
          ? `<div class="bd-ed-luck">${icon('gift')} Omad — savol yoʻq, navbatdagi jamoa darhol <b>${value}</b> ball oladi</div>`
          : `<textarea data-cf="text" rows="2" placeholder="Savol" maxlength="400">${esc(c.text)}</textarea>
        <div class="bd-ed-row">
          <input data-cf="answer" value="${esc(c.answer)}" placeholder="Toʻgʻri javob" maxlength="120">
          <input data-cf="comment" value="${esc(c.comment)}" placeholder="Izoh (ixtiyoriy)" maxlength="400">
        </div>`}
        <div class="bd-ed-row small">
          <select data-cf="special" title="Katakcha turi">${SPECIALS.map(([v, l]) => `<option value="${v}" ${v === c.special ? 'selected' : ''}>${l}</option>`).join('')}</select>
          ${c.special === 'cat' ? `<span class="muted bd-ed-hint">${icon('cat')} jamoa savolni boshqa jamoaga beradi, xato uchun ball ayirilmaydi</span>` : ''}
          ${luck ? '' : `<span class="spacer"></span>
          ${c.image ? `<img class="img-thumb" src="${esc(c.image)}" alt="">` : ''}
          <label class="btn ghost small" title="Rasm yuklash">${icon('image')} Rasm<input type="file" accept="image/*" data-cupload hidden></label>
          ${c.image ? `<button class="icon-btn danger" data-cact="noimg" title="Rasmni olib tashlash">${icon('x')}</button>` : ''}`}
        </div>
      </div>
    </div>`;
}

function renderBoardEditor() {
  $('#ed-questions').innerHTML = draft.topics.map((t, ti) => `
    <div class="card bd-ed" data-t="${ti}">
      <div class="qe-head">
        <span class="num">${ti + 1}</span>
        <input class="bd-ed-name" data-tf="name" value="${esc(t.name)}" placeholder="Mavzu nomi — masalan, Koinot" maxlength="40">
        <span class="spacer"></span>
        <button class="icon-btn" data-tact="up" title="Yuqoriga">${icon('up')}</button>
        <button class="icon-btn" data-tact="down" title="Pastga">${icon('down')}</button>
        <button class="icon-btn danger" data-tact="del" title="Mavzuni oʻchirish">${icon('trash')}</button>
      </div>
      <div class="bd-ed-cells">${t.cells.map(cellEditor).join('')}</div>
    </div>`).join('');
  $('#add-topic').disabled = draft.topics.length >= MAX_TOPICS;
}

const bdEditorRef = e => {
  const card = e.target.closest('[data-t]');
  if (!card || !isBoardDraft()) return {};
  const topic = draft.topics[+card.dataset.t];
  const cellEl = e.target.closest('[data-c]');
  return { topic, ti: +card.dataset.t, cell: cellEl ? topic.cells[+cellEl.dataset.c] : null };
};

$('#ed-questions').addEventListener('input', e => {
  const { topic, cell } = bdEditorRef(e);
  if (!topic) return;
  if (e.target.dataset.tf === 'name') topic.name = e.target.value;
  const f = e.target.dataset.cf;
  if (cell && ['text', 'answer', 'comment'].includes(f)) cell[f] = e.target.value;
  dirty = true;
});

$('#ed-questions').addEventListener('change', async e => {
  const { topic, cell } = bdEditorRef(e);
  if (!topic || !cell) return;
  if (e.target.dataset.cf === 'special') {
    cell.special = e.target.value;
    renderBoardEditor();
  }
  if (e.target.matches('[data-cupload]')) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      toast('Rasm yuklanmoqda…', 1500);
      cell.image = await uploadImage(file);
      renderBoardEditor();
      toast('Rasm yuklandi');
    } catch (err) {
      toast(err.message, 4000);
    }
  }
  dirty = true;
});

$('#ed-questions').addEventListener('click', e => {
  const { topic, ti, cell } = bdEditorRef(e);
  if (!topic) return;
  const tact = e.target.closest('[data-tact]')?.dataset.tact;
  const ts = draft.topics;
  if (tact === 'up' && ti > 0) [ts[ti - 1], ts[ti]] = [ts[ti], ts[ti - 1]];
  if (tact === 'down' && ti < ts.length - 1) [ts[ti + 1], ts[ti]] = [ts[ti], ts[ti + 1]];
  if (tact === 'del') {
    if (ts.length <= 2) return toast('Kamida 2 ta mavzu boʻlishi kerak');
    ts.splice(ti, 1);
  }
  if (e.target.closest('[data-cact="noimg"]') && cell) cell.image = '';
  if (!tact && !e.target.closest('[data-cact]')) return;
  dirty = true;
  renderBoardEditor();
});

$('#add-topic').addEventListener('click', () => {
  if (draft.topics.length >= MAX_TOPICS) return;
  draft.topics.push(blankTopic(draft.values.length));
  dirty = true;
  renderBoardEditor();
  const cards = document.querySelectorAll('#ed-questions [data-t]');
  cards[cards.length - 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
  cards[cards.length - 1].querySelector('.bd-ed-name').focus({ preventScroll: true });
});

$('#ed-values').addEventListener('change', e => {
  draft.values = e.target.value.split(',').map(Number);
  dirty = true;
  renderBoardEditor();
});

// =================== Oʻyinni ochish ===================

let bdQuizId = null;
function openBoardDialog(quizId, title) {
  bdQuizId = quizId;
  zkPrevState = null;
  $('#bd-quiz-title').textContent = title;
  $('#bd-dialog').showModal();
}
$('#bd-cancel').addEventListener('click', () => $('#bd-dialog').close());
$('#f-bd').addEventListener('submit', e => {
  e.preventDefault();
  $('#bd-dialog').close();
  createGame(bdQuizId, {
    teams: +$('#bd-teams-n').value,
    pick: document.querySelector('[name="bd-pick"]:checked').value,
    time: +$('#bd-time').value,
    passOn: $('#bd-pass').checked,
    penaltyAll: $('#bd-penalty').checked,
    turnOrder: $('#bd-turn').value,
  });
});
$('#bd-pass').addEventListener('change', e => ($('#bd-penalty').disabled = !e.target.checked));

// =================== Oʻqituvchi pulti ===================

document.addEventListener('click', async e => {
  if (!e.target.closest('.remote-open') || !zkv) return;
  try {
    const { joinUrl } = await api('GET', '/api/info');
    const link = `${joinUrl}/remote.html?pin=${zkv.pin}&k=${zkv.remoteToken}`;
    $('#remote-link').textContent = link.replace(/^https?:\/\//, '');
    $('#remote-qr').src = '/api/qr?text=' + encodeURIComponent(link);
    $('#remote-dialog').showModal();
  } catch (err) {
    toast(err.message);
  }
});
$('#remote-close').addEventListener('click', () => $('#remote-dialog').close());

// =================== Katta ekran ===================

const bdPrevScores = new Map();
let bdInt = null;
let bdTimerKey = null;
const signed = n => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '±0');
const bdTeam = (v, id) => v.teams.find(t => t.id === id);
const bdChip = (v, id, extra = '') => {
  const t = bdTeam(v, id);
  return t ? `<span class="zk-chip t${t.color} ${extra}">${esc(t.name)}</span>` : '';
};
const bdResults = (v, results) => results.map(r =>
  `<span class="bd-res ${r.delta > 0 ? 'plus' : r.delta < 0 ? 'minus' : ''}">${bdChip(v, r.team)}<b>${signed(r.delta)}</b></span>`).join('');

function bdScores(v) {
  $('#bd-scores').innerHTML = v.teams.map(t => `
    <div class="bd-score t${t.color} ${t.id === v.turnId ? 'turn' : ''}">
      <span class="nm">${t.id === v.turnId ? icon('next') : ''}${esc(t.name)}</span>
      <b class="sc ${t.score < 0 ? 'neg' : ''}" data-id="${t.id}">${fmt(t.score)}</b>
    </div>`).join('');
  // Oʻzgargan ballar sanab chiqadi
  document.querySelectorAll('#bd-scores .sc').forEach(el => {
    const id = +el.dataset.id;
    const now = bdTeam(v, id).score;
    const before = bdPrevScores.get(id);
    if (before !== undefined && before !== now) countUp(el, now, { from: before, ms: 1100 });
    bdPrevScores.set(id, now);
  });
}

function bdBoard(v) {
  clearInterval(bdInt);
  bdTimerKey = null;
  if (zkPrevState === 'lobby' || zkPrevState === null) bdPrevScores.clear();
  bdScores(v);
  $('#bd-turnline').innerHTML = `Navbat: ${bdChip(v, v.turnId, 'big')} <span>katakcha tanlaydi</span>`;
  const animate = zkPrevState !== 'board';
  const grid = $('#bd-grid');
  grid.style.gridTemplateColumns = `minmax(150px, 1.35fr) repeat(${v.values.length}, 1fr)`;
  grid.innerHTML = v.topics.map((name, ti) => `
    <div class="bd-topic" ${animate ? `style="animation-delay:${ti * 60}ms"` : 'style="animation:none"'}>${esc(name)}</div>
    ${v.values.map((val, ci) => {
      const st = v.grid[ti][ci];
      return `<button class="bd-cell ${st.played ? 'played' : ''} ${st.empty ? 'empty' : ''}" data-t="${ti}" data-c="${ci}" ${st.played || st.empty ? 'disabled' : ''}
        ${animate ? `style="animation-delay:${ti * 60 + ci * 30}ms"` : 'style="animation:none"'}>${st.played || st.empty ? '' : val}</button>`;
    }).join('')}`).join('');
  Translit.markRaw(v.raw, grid);
  screen('s-bd-board');
}
$('#bd-grid').addEventListener('click', e => {
  const b = e.target.closest('.bd-cell:not([disabled])');
  if (b) socket.emit('zk:open', { t: +b.dataset.t, c: +b.dataset.c });
});
$('#bd-end-early').addEventListener('click', e => {
  if (confirmClick(e.currentTarget, 'Yakunlansinmi?')) socket.emit('zk:end');
});

function bdQuestion(v) {
  const c = v.cur;
  const isQ = v.state === 'question';
  $('#bdq-tag').textContent = `${c.topic} · ${c.value}`;
  $('#bdq-team').innerHTML = isQ ? `${bdChip(v, c.answering, 'big')} <span>javob beradi</span>` : '';

  const sp = $('#bdq-special');
  sp.classList.toggle('hidden', !c.special);
  if (v.state === 'cat') {
    sp.className = 'bd-special cat';
    sp.innerHTML = `${icon('cat')}<div><b>Mushuk qopda!</b><span>${esc(bdTeam(v, v.turnId).name)} savolni boshqa jamoaga beradi. Xato javob uchun ball ayirilmaydi.</span></div>`;
  } else if (v.state === 'luck') {
    sp.className = 'bd-special luck';
    sp.innerHTML = `${icon('gift')}<div><b>Omad!</b><span>${esc(bdTeam(v, v.turnId).name)} savolsiz <b>${c.value}</b> ball oladi</span></div>`;
  } else if (c.cat) {
    sp.className = 'bd-special cat small';
    sp.innerHTML = `${icon('cat')}<div><span>Mushuk qopda — xato uchun ball ayirilmaydi</span></div>`;
  }

  Translit.markRaw(v.raw, $('#bdq-text'), $('#bdq-answer'));
  $('#bdq-text').classList.toggle('hidden', !isQ);
  $('#bdq-text').textContent = isQ ? c.text : '';
  $('#bdq-img').classList.toggle('hidden', !isQ || !c.image);
  if (isQ && c.image) $('#bdq-img').src = c.image;
  $('#bdq-timer-row').classList.toggle('hidden', !isQ);
  $('#bdq-peek').classList.toggle('hidden', !isQ);
  $('#bdq-answer').textContent = `Javob: ${c.answer || ''}`;

  $('#bd-catpick').classList.toggle('hidden', v.state !== 'cat');
  $('#bd-catpick').innerHTML = v.teams.filter(t => t.id !== v.turnId)
    .map(t => `<button class="btn bd-catbtn t${t.color}" data-team="${t.id}">${esc(t.name)}</button>`).join('');
  $('#bd-luck-next').classList.toggle('hidden', v.state !== 'luck');
  $('#bdq-results').innerHTML = bdResults(v, c.results);

  // Yangi savol yoki savol keyingi jamoaga oʻtdi — taymer qaytadan
  const key = `${c.ti}:${c.ci}:${c.answering}:${v.state}`;
  if (key !== bdTimerKey) {
    bdTimerKey = key;
    if (v.state === 'luck') {
      Sound.fanfare();
      confetti({ count: 120, duration: 2500 });
    } else if (v.state === 'cat') [0, 180, 360].forEach((d, i) => setTimeout(() => Sound.beep([880, 660, 990][i], 0.16, 'triangle'), d));
    else if (c.results.length) Sound.bad();
    else Sound.beep(660, 0.2, 'triangle');
    if (isQ) bdRunTimer(c);
  }
  screen('s-bd-q');
}

function bdRunTimer(c) {
  const endsAt = Date.now() + c.endsIn;
  const total = c.time * 1000;
  const ring = $('#bd-ring');
  clearInterval(bdInt);
  let lastLeft = null;
  const tick = () => {
    const ms = Math.max(0, endsAt - Date.now());
    const left = Math.ceil(ms / 1000);
    $('#bd-timer').textContent = left;
    ring.style.setProperty('--p', (ms / total) * 100);
    ring.classList.toggle('low', left <= 5);
    if (left !== lastLeft && left <= 5 && left > 0) Sound.tick();
    if (left === 0 && lastLeft !== 0) Sound.gong();
    lastLeft = left;
    if (left <= 0) clearInterval(bdInt);
  };
  tick();
  bdInt = setInterval(tick, 200);
}

$('#bd-judge').addEventListener('click', e => {
  const b = e.target.closest('[data-v]');
  if (b) socket.emit('zk:verdict', { ok: b.dataset.v === '1' });
});
$('#bd-nobody').addEventListener('click', () => socket.emit('zk:nobody'));
$('#bd-catpick').addEventListener('click', e => {
  const b = e.target.closest('[data-team]');
  if (b) socket.emit('zk:cat', +b.dataset.team);
});
$('#bd-luck-next').addEventListener('click', () => socket.emit('zk:next'));

// Javobni koʻrish: tugma bosib turilgandagina chiqadi (katta ekranda tasodifan qolib ketmasin)
const peek = on => $('#bdq-answer').classList.toggle('hidden', !on);
['mousedown', 'touchstart'].forEach(ev => $('#bdq-peek').addEventListener(ev, () => peek(true)));
['mouseup', 'mouseleave', 'touchend', 'blur'].forEach(ev => $('#bdq-peek').addEventListener(ev, () => peek(false)));

function bdReveal(v) {
  clearInterval(bdInt);
  const c = v.cur;
  $('#bdr-tag').textContent = `${c.topic} · ${c.value}`;
  Translit.markRaw(v.raw, $('#bdr-answer'), $('#bdr-comment'));
  $('#bdr-answer').textContent = c.answer;
  $('#bdr-comment').classList.toggle('hidden', !c.comment);
  $('#bdr-comment').innerHTML = c.comment ? `${icon('message')}<span>${esc(c.comment)}</span>` : '';
  const won = c.results.some(r => r.delta > 0);
  $('#bdr-results').innerHTML = c.results.length
    ? bdResults(v, c.results)
    : `<div class="zk-found-title none">${icon('xCircle')} Hech kim javob bermadi</div>`;
  if (zkPrevState !== 'reveal') {
    if (won) {
      Sound.good();
      confetti({ count: 70, duration: 1800 });
    } else Sound.bad();
  }
  screen('s-bd-reveal');
}
$('#bd-back').addEventListener('click', () => socket.emit('zk:next'));

function bdEnd(v) {
  clearInterval(bdInt);
  if (game) $('#zk-csv').href = `/api/games/${game.pin}/results.csv?token=${game.hostToken}`;
  const rows = [...v.teams].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  rows.forEach((r, i) => (r.rank = i > 0 && rows[i - 1].score === r.score ? rows[i - 1].rank : i + 1));
  $('#zk-end-table').innerHTML = `<table class="zk-grid">
    <tr><th>#</th><th class="tn">Jamoa</th><th class="sum">Ball</th></tr>
    ${rows.map(r => `<tr><td class="rk">${r.rank}</td><td class="tn"><span class="dot t${r.color}"></span>${esc(r.name)}</td><td class="sum">${fmt(r.score)}</td></tr>`).join('')}
  </table>
  <table class="zk-grid bd-log">
    <tr><th>#</th><th class="tn">Mavzu</th><th>Ball</th><th class="tn">Natija</th></tr>
    ${v.log.map((e, i) => `<tr><td class="rk">${i + 1}</td><td class="tn">${esc(e.topic)}</td><td>${e.value}</td>
      <td class="tn">${e.special === 'luck' ? `${icon('gift')} ` : e.special === 'cat' ? `${icon('cat')} ` : ''}${e.results.length ? bdResults(v, e.results) : '<span class="bd-none">Hech kim</span>'}</td></tr>`).join('')}
  </table>`;
  if (zkPrevState === 'ended') return;
  const order = [1, 0, 2]; // 2-oʻrin, 1-oʻrin, 3-oʻrin
  const top = rows.slice(0, 3);
  $('#zk-podium').innerHTML = order.filter(i => top[i]).map(i => `
    <div class="step p${i + 1}">
      <div class="who">${esc(top[i].name)}</div>
      <div class="pts">${fmt(top[i].score)} ball · ${top[i].members.length} kishi</div>
      <div class="block">${medal(top[i].rank)}</div>
    </div>`).join('') || `<div class="waiting">${icon('users')}Jamoalar yoʻq</div>`;
  $('#zk-end-table').classList.add('hidden');
  screen('s-zk-end');
  setTimeout(() => {
    Sound.fanfare();
    if (top.length) confetti({ count: 220, duration: 4500 });
  }, 1400);
}

const BOARD_SCREENS = { board: bdBoard, question: bdQuestion, cat: bdQuestion, luck: bdQuestion, reveal: bdReveal, ended: bdEnd };
