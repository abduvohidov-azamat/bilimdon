// Oʻyinchi (oʻquvchi) tomoni
const socket = io();
const STORE = 'bilimdon-session';
let session = null; // { pin, playerId, name }
let pin = '';
let timerInt = null;
let lastScore = 0;

function saveSession(s) {
  session = s;
  try { s ? localStorage.setItem(STORE, JSON.stringify(s)) : localStorage.removeItem(STORE); } catch {}
}
function loadSession() {
  try { return JSON.parse(localStorage.getItem(STORE)); } catch { return null; }
}
function setScore(score) {
  lastScore = score;
  document.querySelectorAll('.me-score').forEach(e => (e.textContent = fmt(score)));
}

// Yozuv/rejim tugmalari faqat kirish ekranlarida koʻrinadi (oʻyin paytida xalaqit bermasin)
const baseShow = show;
show = id => {
  baseShow(id);
  $('#corner-tools').classList.toggle('hidden', !['s-pin', 's-name', 's-end', 's-kicked', 'z-pick', 'z-end'].includes(id));
};
function setName(name) {
  document.querySelectorAll('.me-name').forEach(e => (e.textContent = name));
}
function setTeam(team) {
  document.querySelectorAll('.me-team').forEach(e => {
    e.classList.toggle('hidden', !team);
    if (team) {
      e.className = `team-chip me-team a${team.index}`;
      e.textContent = team.name;
    }
  });
  const lt = $('#lobby-team');
  lt.classList.toggle('hidden', !team);
  if (team) lt.textContent = `Jamoangiz: ${team.name}`;
}

// --- PIN ---
const pinInput = $('#pin');
pinInput.addEventListener('input', () => (pinInput.value = pinInput.value.replace(/\D/g, '')));
$('#f-pin').addEventListener('submit', e => {
  e.preventDefault();
  checkPin(pinInput.value.trim());
});

function checkPin(value) {
  $('#pin-err').textContent = '';
  if (!/^\d{6}$/.test(value)) return ($('#pin-err').textContent = 'PIN-kod 6 ta raqamdan iborat');
  socket.emit('player:check', value, res => {
    if (res.error) return ($('#pin-err').textContent = res.error);
    pin = value;
    Translit.markRaw(res.raw, $('#name-title'));
    $('#name-title').textContent = res.title;
    show('s-name');
    setTimeout(() => $('#name').focus(), 50);
  });
}

// --- Ism ---
$('#f-name').addEventListener('submit', e => {
  e.preventDefault();
  $('#name-err').textContent = '';
  const name = $('#name').value.trim();
  socket.emit('player:join', { pin, name }, res => {
    if (res.error) return ($('#name-err').textContent = res.error);
    saveSession({ pin, playerId: res.playerId, name: res.name });
    setName(res.name);
  });
});

// --- Qayta ulanish ---
function tryRejoin() {
  const s = session || loadSession();
  if (!s) return;
  socket.emit('player:join', { pin: s.pin, playerId: s.playerId }, res => {
    if (res.error) {
      saveSession(null);
      if (document.querySelector('#s-pin.hidden')) { show('s-pin'); toast(res.error); }
      return;
    }
    pin = s.pin;
    session = s;
    setName(res.name);
  });
}
socket.on('connect', tryRejoin);

// --- Server hodisalari ---
socket.on('sync', d => {
  setName(d.name);
  setScore(d.score);
  setTeam(d.team);
  if (d.state === 'playing') return;
  if (d.state === 'lobby') show('s-lobby');
  else {
    $('#wait-title').textContent = 'Keyingi savolni kuting';
    $('#wait-sub').textContent = 'Oʻyin davom etmoqda…';
    show('s-wait');
  }
});

socket.on('game:started', d => {
  setTeam(d.team);
  Sound.beep(660, 0.2, 'triangle');
});

socket.on('q:getready', d => {
  clearInterval(timerInt);
  $('#ready-num').textContent = `${d.index + 1}-savol / ${d.total}`;
  $('#ready-text').textContent = 'Tayyorlaning!';
  $('#ready-double').classList.toggle('hidden', d.points !== 2);
  show('s-ready');
  let n = 3;
  const el = $('#ready-count');
  el.textContent = n;
  const t = setInterval(() => {
    n--;
    if (n <= 0) return clearInterval(t);
    el.textContent = n;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    Sound.tick();
  }, 1000);
});

socket.on('q:show', d => {
  // Server qolgan vaqtni yuboradi — telefon soati notoʻgʻri boʻlsa ham taymer toʻgʻri
  const endsAt = Date.now() + d.remaining;
  Translit.markRaw(d.raw, $('#q-text'), $('#answers'));
  $('#q-num').textContent = `${d.index + 1} / ${d.total}`;
  $('#q-text').textContent = d.text;
  const box = $('#answers');
  box.className = 'answers' + (d.options.length === 2 ? ' tf' : '');
  box.innerHTML = d.options.map((o, i) =>
    `<button class="ans a${i}" data-i="${i}">${SHAPES[i]}<span>${esc(o)}</span></button>`).join('');
  box.querySelectorAll('.ans').forEach(b => b.addEventListener('click', () => answer(+b.dataset.i)));
  show('s-question');

  clearInterval(timerInt);
  const tick = () => {
    const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    $('#q-timer').textContent = left;
    $('#q-timer-wrap').classList.toggle('low', left <= 5 && left > 0);
    if (left <= 0) clearInterval(timerInt);
  };
  tick();
  timerInt = setInterval(tick, 250);
});

let answering = false;
function answer(i) {
  if (answering) return;
  answering = true;
  if (navigator.vibrate) navigator.vibrate(30);
  socket.emit('player:answer', i, res => {
    answering = false;
    $('#wait-title').textContent = res.ok ? 'Javob qabul qilindi!' : 'Vaqt tugadi';
    $('#wait-sub').textContent = res.ok ? 'Boshqalarni kutamiz… Siz tezkor ekansiz!' : 'Natijani kuting…';
    show('s-wait');
  });
}

socket.on('q:result', r => {
  clearInterval(timerInt);
  const res = $('#result');
  res.className = 'screen hidden ' + (r.correct ? 'good' : 'bad');
  const badge = $('#r-icon');
  badge.innerHTML = icon(r.correct ? 'checkCircle' : r.answered ? 'xCircle' : 'clock');
  badge.classList.toggle('shake', !r.correct);
  $('#r-title').textContent = r.correct ? 'Toʻgʻri!' : r.answered ? 'Notoʻgʻri' : 'Vaqt tugadi';
  const pts = $('#r-points');
  if (r.correct) {
    pts.innerHTML = `${icon('star')} <span></span>`;
    countUp(pts.querySelector('span'), r.points, { prefix: '+', suffix: ' ball' });
  } else pts.innerHTML = `${icon('trend')} Keyingi safar omad!`;
  const st = $('#r-streak');
  st.classList.toggle('hidden', r.streak < 2);
  st.innerHTML = `${icon('flame')} Ketma-ket ${r.streak} ta toʻgʻri`;
  $('#r-correct').innerHTML = r.correct ? '' : `Toʻgʻri javob: <b ${r.raw ? 'data-raw' : ''}>${esc(r.correctText)}</b>`;
  $('#r-team').classList.toggle('hidden', !r.team);
  if (r.team) $('#r-team').innerHTML = `${icon('users')} ${esc(r.team.name)} jamoasi — ${r.team.rank}-oʻrinda (${r.team.total} jamoadan)`;
  $('#r-rank').innerHTML = r.rank === 1
    ? `${icon('trophy')} Siz birinchi oʻrindasiz!`
    : `Siz ${r.rank}-oʻrindasiz` + (r.behind ? ` · ${esc(r.behind.name)} dan ${fmt(r.behind.gap)} ball orqada` : '');
  r.correct ? Sound.good() : Sound.bad();
  if (navigator.vibrate) navigator.vibrate(r.correct ? [40, 40, 40] : 200);
  show('result');
  document.querySelectorAll('.me-score').forEach(e => countUp(e, r.score, { from: lastScore }));
  lastScore = r.score;
});

socket.on('game:end', d => {
  clearInterval(timerInt);
  const badge = $('#e-medal');
  badge.innerHTML = d.rank <= 3 ? medal(d.rank) : icon('target');
  badge.classList.toggle('gold', d.rank === 1);
  $('#e-rank').textContent = `${d.rank}`;
  $('#e-title').textContent = d.rank <= 3 ? 'Ajoyib natija! Siz shohsupadasiz!' : `${d.totalPlayers} ta ishtirokchi orasida`;
  $('#e-score').innerHTML = `${icon('star')} <span></span>`;
  countUp($('#e-score span'), d.score, { suffix: ' ball', ms: 1400 });
  $('#e-correct').innerHTML = `${icon('check')} ${d.correctCount}/${d.totalQuestions} toʻgʻri`;
  $('#e-team').classList.toggle('hidden', !d.team);
  if (d.team) $('#e-team').innerHTML = d.team.rank === 1 ? `${icon('trophy')} ${esc(d.team.name)} jamoasi gʻolib!` : `${icon('users')} ${esc(d.team.name)} — ${d.team.rank}-oʻrin`;
  if (d.rank <= 3) {
    Sound.fanfare();
    setTimeout(() => confetti(), 300);
  }
  saveSession(null);
  show('s-end');
});

socket.on('kicked', () => {
  saveSession(null);
  show('s-kicked');
});

// QR-koddan kelgan PIN: /?pin=123456
const urlPin = new URLSearchParams(location.search).get('pin');
if (urlPin && !loadSession()) {
  pinInput.value = urlPin;
  socket.once('connect', () => checkPin(urlPin));
}
