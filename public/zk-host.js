// Zakovat — boshlovchi (oʻqituvchi) ekranlari. Server har oʻzgarishda toʻliq holatni ('zk:state') yuboradi.
let zkv = null; // oxirgi holat
let zkInt = null;
let zkPrevState = null;
const zkSounds = new Set(); // har bir savolda gong/ogohlantirish bir marta chalinadi

// =================== Oʻyinni ochish ===================

let zkQuizId = null;
function openZkDialog(quizId, title) {
  zkQuizId = quizId;
  zkPrevState = null;
  $('#zk-quiz-title').textContent = title;
  $('#zk-dialog').showModal();
}
$('#zk-cancel').addEventListener('click', () => $('#zk-dialog').close());
$('#f-zk').addEventListener('submit', e => {
  e.preventDefault();
  $('#zk-dialog').close();
  createGame(zkQuizId, { teams: +$('#zk-teams-n').value, pick: document.querySelector('[name="zk-pick"]:checked').value });
});

// =================== Holatni chizish ===================

const teamName = id => zkv.teams.find(t => t.id === id)?.name || '';
const teamColor = id => zkv.teams.find(t => t.id === id)?.color ?? 0;
const teamChip = (id, extra = '') => `<span class="zk-chip t${teamColor(id)} ${extra}">${esc(teamName(id))}</span>`;
const qNum = v => `${v.qIndex + 1}-savol / ${v.total}`;

socket.on('zk:state', v => {
  zkv = v;
  if (game) game.ended = v.state === 'ended';
  if (v.state !== 'think') clearInterval(zkInt);
  // Kutish zali umumiy; qolgan ekranlar oʻyin turiga qarab (Oʻz oʻyini — board-host.js)
  const screens = v.kind === 'board'
    ? { lobby: zkLobby, ...BOARD_SCREENS }
    : { lobby: zkLobby, read: zkQuestion, think: zkQuestion, judge: zkJudge, reveal: zkReveal, table: zkTable, ended: zkEnd };
  screens[v.state](v);
  zkPrevState = v.state;
});

// --- Kutish zali ---
async function zkJoinInfo(pin) {
  try {
    const { joinUrl } = await api('GET', '/api/info');
    $('#zk-url').textContent = joinUrl.replace(/^https?:\/\//, '');
    $('#zk-qr').src = '/api/qr?text=' + encodeURIComponent(`${joinUrl}/?pin=${pin}`);
  } catch {}
}

function zkLobby(v) {
  if (zkPrevState !== 'lobby') {
    $('#zk-pin').textContent = v.pin.replace(/(\d{3})(\d{3})/, '$1 $2');
    Translit.markRaw(v.raw, $('#zk-title'));
    $('#zk-title').textContent = v.title;
    $('#zk-kind-badge').innerHTML = v.kind === 'board' ? `${icon('grid')} Oʻz oʻyini` : `${icon('brain')} Zakovat`;
    $('#zk-hint-cap').classList.toggle('hidden', !v.captains);
    $('#zk-remote-btn').classList.toggle('hidden', v.kind !== 'board');
    zkJoinInfo(v.pin);
  }
  const known = new Set([...document.querySelectorAll('#s-zk-lobby .zk-member')].map(e => e.dataset.id));
  const count = v.teams.reduce((n, t) => n + t.members.length, 0) + v.unassigned.length;
  if (count > +$('#zk-count').textContent) Sound.beep(740 + Math.random() * 200, 0.1, 'triangle');
  $('#zk-count').textContent = count;
  $('#zk-start').disabled = count === 0;
  zkLockLabel(v.locked);

  const isCap = (p, t) => v.captains && t && t.captainId === p.id;
  const member = (p, t) => `
    <div class="zk-member ${p.connected ? '' : 'off'} ${isCap(p, t) ? 'cap' : ''}" data-id="${p.id}" ${known.has(p.id) ? 'style="animation:none"' : ''}>
      <span class="nm">${isCap(p, t) ? icon('star') : ''}${esc(p.name)}</span>
      ${v.captains && t && !isCap(p, t) ? `<button data-act="cap" title="Sardor qilish">${icon('star')}</button>` : ''}
      <button data-act="kick" title="Oʻyindan chiqarish">${icon('x')}</button>
    </div>`;
  $('#zk-teams').innerHTML = v.teams.map(t => `
    <div class="zk-team" ${zkPrevState === 'lobby' ? 'style="animation:none"' : ''}>
      <div class="zk-team-head t${t.color}"><span>${esc(t.name)}</span><span class="n">${icon('users')} ${t.members.length}</span></div>
      <div class="zk-members">${t.members.map(p => member(p, t)).join('') || '<span class="zk-empty">Hali hech kim yoʻq</span>'}</div>
    </div>`).join('');
  const un = $('#zk-unassigned');
  un.classList.toggle('hidden', !v.unassigned.length);
  un.innerHTML = `<span class="lbl">${icon('hourglass')} Jamoa tanlamoqda:</span>` + v.unassigned.map(p => member(p, null)).join('');
  screen('s-zk-lobby');
}

function zkLockLabel(locked) {
  const b = $('#zk-lock');
  b.dataset.locked = locked ? '1' : '';
  b.innerHTML = locked ? `${icon('lock')} Qulflangan` : `${icon('unlock')} Ochiq`;
}
$('#zk-lock').addEventListener('click', () => {
  const locked = !$('#zk-lock').dataset.locked;
  zkLockLabel(locked);
  socket.emit('zk:lock', locked);
});
$('#s-zk-lobby').addEventListener('click', e => {
  const b = e.target.closest('.zk-member button');
  if (!b) return;
  const id = b.closest('.zk-member').dataset.id;
  socket.emit(b.dataset.act === 'cap' ? 'zk:captain' : 'zk:kick', id);
});
$('#zk-start').addEventListener('click', () => socket.emit('zk:start'));

// --- Savol: oʻqish va muhokama ---
function zkQuestion(v) {
  const fresh = zkPrevState !== v.state || $('#zkq-num').dataset.q !== String(v.qIndex);
  $('#zkq-num').dataset.q = v.qIndex;
  $('#zkq-num').textContent = qNum(v);
  if (fresh) {
    Translit.markRaw(v.raw, $('#zkq-text'));
    $('#zkq-text').textContent = v.q.text;
    $('#zkq-img').classList.toggle('hidden', !v.q.image);
    if (v.q.image) $('#zkq-img').src = v.q.image;
  }
  const reading = v.state === 'read';
  $('#zk-go').classList.toggle('hidden', !reading);
  $('#zk-skip').classList.toggle('hidden', reading);
  const ring = $('#zk-ring');

  if (reading) {
    clearInterval(zkInt);
    ring.classList.remove('low', 'extra');
    ring.style.setProperty('--p', 100);
    $('#zk-timer').textContent = v.q.time;
    $('#zk-status').textContent = 'Savolni ovoz chiqarib oʻqing, soʻng «Vaqt ketdi» tugmasini bosing';
  } else if (fresh) {
    zkRunTimer(v);
  }
  // Javob yuborgan jamoalar yashil boʻladi
  $('#zk-sent').innerHTML = reading ? '' : v.teams.map(t => `<span class="zk-chip t${t.color} ${v.submitted.includes(t.id) ? 'sent' : 'idle'}">${v.submitted.includes(t.id) ? icon('check') : ''}${esc(t.name)}</span>`).join('');
  screen('s-zk-q');
}

function zkRunTimer(v) {
  const endsAt = Date.now() + v.timer.endsIn;
  const locksAt = Date.now() + v.timer.locksIn;
  const total = v.q.time * 1000;
  const key = v.qIndex;
  if (!zkSounds.has(`${key}:start`) && v.timer.endsIn > total - 2000) {
    zkSounds.add(`${key}:start`);
    Sound.gong();
  }
  const ring = $('#zk-ring');
  clearInterval(zkInt);
  const tick = () => {
    const ms = endsAt - Date.now();
    if (ms > 0) {
      const left = Math.ceil(ms / 1000);
      $('#zk-timer').textContent = left;
      ring.style.setProperty('--p', (ms / total) * 100);
      ring.classList.toggle('low', left <= 10);
      $('#zk-status').textContent = left <= 10 ? '10 soniya qoldi!' : 'Jamoalar muhokama qilmoqda…';
      if (left <= 10 && !zkSounds.has(`${key}:warn`)) {
        zkSounds.add(`${key}:warn`);
        [0, 250].forEach(d => setTimeout(() => Sound.beep(880, 0.15, 'square', 0.08), d));
      }
      return;
    }
    if (!zkSounds.has(`${key}:end`)) {
      zkSounds.add(`${key}:end`);
      Sound.gong();
    }
    const extra = Math.max(0, Math.ceil((locksAt - Date.now()) / 1000));
    ring.classList.remove('low');
    ring.classList.add('extra');
    ring.style.setProperty('--p', (extra / 10) * 100);
    $('#zk-timer').textContent = `+${extra}`;
    $('#zk-status').textContent = 'Vaqt tugadi! Sardorlar javobni yuborsin';
    if (extra <= 0) clearInterval(zkInt);
  };
  ring.classList.remove('extra');
  tick();
  zkInt = setInterval(tick, 200);
}

$('#zk-go').addEventListener('click', () => socket.emit('zk:go'));
$('#zk-skip').addEventListener('click', () => socket.emit('zk:skip'));

// --- Baholash ---
const HOW = { exact: 'avtomatik', fuzzy: 'imlo xatosi bilan', reject: 'sanalmaydi roʻyxatida', host: '' };

function zkJudge(v) {
  $('#zkj-num').textContent = qNum(v);
  Translit.markRaw(v.raw, $('#zkj-answer'), $('#zkj-accept'), $('#zk-groups'));
  $('#zkj-answer').textContent = v.q.answer;
  $('#zkj-accept').textContent = v.q.accept.length ? `Sanaladi: ${v.q.accept.join(', ')}` : '';
  // Baholash tugmasi bosilganda roʻyxat qayta "uchib kirmasin" — animatsiya faqat birinchi marta
  const still = zkPrevState === 'judge' ? 'style="animation:none"' : '';
  $('#zk-groups').innerHTML = v.groups.length
    ? v.groups.map(g => `
      <div class="zk-group ${g.ok === null ? 'pending' : g.ok ? 'ok' : 'no'}" data-key="${esc(g.key)}" ${still}>
        <div class="grow">
          <div class="zk-ans">${esc(g.text)}</div>
          <div class="zk-by">${g.teams.map(id => teamChip(id)).join('')}${g.how && HOW[g.how] ? `<span class="zk-how">${HOW[g.how]}</span>` : ''}</div>
        </div>
        <button class="zk-v ok ${g.ok === true ? 'on' : ''}" data-ok="1" title="Toʻgʻri">${icon('check')}</button>
        <button class="zk-v no ${g.ok === false ? 'on' : ''}" data-ok="0" title="Notoʻgʻri">${icon('x')}</button>
      </div>`).join('')
    : `<div class="waiting">${icon('hourglass')}Hech bir jamoa javob yubormadi</div>`;
  $('#zkj-missing').innerHTML = v.missing.length ? `Javob yubormadi: ${v.missing.map(id => teamChip(id)).join('')}` : '';
  const pending = v.groups.filter(g => g.ok === null).length;
  const btn = $('#zk-confirm');
  btn.disabled = pending > 0;
  btn.innerHTML = pending ? `${icon('hourglass')} Baholanmagan: ${pending}` : `Javobni eʼlon qilish ${icon('next')}`;
  screen('s-zk-judge');
}

$('#zk-groups').addEventListener('click', e => {
  const b = e.target.closest('.zk-v');
  if (b) socket.emit('zk:judge', { key: b.closest('.zk-group').dataset.key, ok: b.dataset.ok === '1' });
});
$('#zk-confirm').addEventListener('click', () => socket.emit('zk:confirm'));

// --- Toʻgʻri javob ---
function zkReveal(v) {
  $('#zkr-num').textContent = qNum(v);
  Translit.markRaw(v.raw, $('#zkr-answer'), $('#zkr-accept'), $('#zkr-comment'), $('#zkr-source'));
  $('#zkr-answer').textContent = v.q.answer;
  $('#zkr-accept').textContent = v.q.accept.length ? `Sanaladi: ${v.q.accept.join(', ')}` : '';
  $('#zkr-comment').classList.toggle('hidden', !v.q.comment);
  $('#zkr-comment').innerHTML = v.q.comment ? `${icon('message')}<span>${esc(v.q.comment)}</span>` : '';
  $('#zkr-source').textContent = v.q.source ? `Manba: ${v.q.source}` : '';
  const row = v.table.rows;
  const found = row.filter(r => r.marks[v.qIndex]);
  $('#zkr-found').innerHTML = found.length
    ? `<div class="zk-found-title">${icon('checkCircle')} ${found.length} ta jamoa topdi</div>${found.map(r => teamChip(r.id, 'big')).join('')}`
    : `<div class="zk-found-title none">${icon('xCircle')} Hech kim topmadi</div>`;
  if (zkPrevState !== 'reveal') {
    found.length ? Sound.good() : Sound.bad();
    if (found.length) confetti({ count: 60, duration: 1800 });
  }
  screen('s-zk-reveal');
}
$('#zk-to-table').addEventListener('click', () => socket.emit('zk:next'));

// --- Natijalar jadvali ---
function zkGrid(v, editable) {
  const { rows, counts } = v.table;
  if (!rows.length) return `<div class="waiting">${icon('users')}Jamoalar yoʻq</div>`;
  return `<table class="zk-grid">
    <tr><th>#</th><th class="tn">Jamoa</th>${counts.map((_, i) => `<th>${i + 1}</th>`).join('')}<th class="sum">Jami</th></tr>
    ${rows.map(r => `<tr>
      <td class="rk">${r.rank}</td>
      <td class="tn"><span class="dot t${r.color}"></span>${esc(r.name)}</td>
      ${r.marks.map((m, i) => `<td class="c ${m ? 'ok' : 'no'} ${editable ? 'edit' : ''}" data-team="${r.id}" data-q="${i}">${m ? '+' : '−'}</td>`).join('')}
      <td class="sum">${r.score}</td></tr>`).join('')}
    <tr class="foot"><td></td><td class="tn">Topganlar</td>${counts.map(c => `<td>${c}</td>`).join('')}<td></td></tr>
  </table>`;
}

function zkTable(v) {
  const last = v.qIndex >= v.total - 1;
  $('#zkt-title').textContent = `Natijalar · ${v.played}/${v.total}`;
  $('#zk-next').innerHTML = last ? `Yakuniy natijalar ${icon('trophy')}` : `Keyingi savol ${icon('next')}`;
  $('#zk-table').innerHTML = zkGrid(v, true);
  screen('s-zk-table');
}

document.addEventListener('click', e => {
  const c = e.target.closest('.zk-grid td.edit');
  if (c) socket.emit('zk:fix', { teamId: +c.dataset.team, q: +c.dataset.q });
});
$('#zk-next').addEventListener('click', () => socket.emit('zk:next'));
$('#zk-end-early').addEventListener('click', e => {
  if (confirmClick(e.currentTarget, 'Yakunlansinmi?')) socket.emit('zk:end');
});

// --- Yakun ---
function zkEnd(v) {
  $('#zk-end-table').innerHTML = zkGrid(v, true);
  if (game) $('#zk-csv').href = `/api/games/${game.pin}/results.csv?token=${game.hostToken}`;
  if (zkPrevState === 'ended') return; // apellyatsiyadan keyin faqat jadval yangilanadi
  const order = [1, 0, 2]; // 2-oʻrin, 1-oʻrin, 3-oʻrin
  const top = v.table.rows.slice(0, 3);
  $('#zk-podium').innerHTML = order.filter(i => top[i]).map(i => `
    <div class="step p${i + 1}">
      <div class="who">${esc(top[i].name)}</div>
      <div class="pts">${top[i].score} ball · ${top[i].members.length} kishi</div>
      <div class="block">${medal(top[i].rank)}</div>
    </div>`).join('') || `<div class="waiting">${icon('users')}Jamoalar yoʻq</div>`;
  $('#zk-end-table').classList.add('hidden');
  screen('s-zk-end');
  setTimeout(() => {
    Sound.fanfare();
    if (top.length) confetti({ count: 220, duration: 4500 });
  }, 1400);
}
$('#zk-full').addEventListener('click', () => $('#zk-end-table').classList.toggle('hidden'));
$('#zk-home').addEventListener('click', () => {
  zkPrevState = null;
  saveHost(null);
  loadLibrary();
});
