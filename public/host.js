// Boshlovchi (oʻqituvchi) tomoni
// Socket faqat tizimga kirgandan keyin ulanadi — server sessiya cookieni ulanish vaqtida tekshiradi
const socket = io({ autoConnect: false });
const HOST_STORE = 'bilimdon-host';
const TF_OPTS = ['Toʻgʻri', 'Notoʻgʻri'];
const TIMES = [5, 10, 20, 30, 60, 90, 120];
let me = null;
let game = null; // { pin, hostToken, title, total }
let timerInt = null;
setTimeout(() => ($('#btn-sound').innerHTML = icon('sound')));

const LIGHT_SCREENS = ['s-library', 's-editor', 's-hw'];
function screen(id) {
  document.body.classList.toggle('light', LIGHT_SCREENS.includes(id));
  show(id);
}

async function api(method, url, body) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.startsWith('/api/auth')) {
    showAuth();
    throw new Error(data.error || 'Iltimos, tizimga kiring');
  }
  if (!res.ok) throw new Error(data.error || 'Xatolik yuz berdi');
  return data;
}

const fmtDate = t => new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Ikki marta bosib tasdiqlash (brauzer oynalarisiz)
function confirmClick(btn, label = 'Aniqmi?') {
  if (btn.dataset.confirm) return true;
  const old = btn.innerHTML;
  btn.dataset.confirm = 1;
  btn.textContent = label;
  btn.classList.add('red');
  setTimeout(() => {
    delete btn.dataset.confirm;
    btn.innerHTML = old;
    btn.classList.remove('red');
  }, 3000);
  return false;
}

// =================== KIRISH ===================

let authMode = 'login';
function showAuth() {
  me = null;
  socket.disconnect();
  screen('s-auth');
  setAuthMode(authMode);
}
function setAuthMode(m) {
  authMode = m;
  document.querySelectorAll('.auth-tabs button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  $('#auth-name-wrap').classList.toggle('hidden', m === 'login');
  $('#auth-submit').textContent = m === 'login' ? 'Kirish' : 'Roʻyxatdan oʻtish';
  $('#auth-password').autocomplete = m === 'login' ? 'current-password' : 'new-password';
  $('#auth-password').placeholder = m === 'login' ? 'Parol' : 'Parol (kamida 6 ta belgi)';
  $('#auth-err').textContent = '';
}
document.querySelectorAll('.auth-tabs button').forEach(b => b.addEventListener('click', () => setAuthMode(b.dataset.mode)));

$('#f-auth').addEventListener('submit', async e => {
  e.preventDefault();
  $('#auth-err').textContent = '';
  try {
    me = await api('POST', `/api/auth/${authMode}`, {
      name: $('#auth-name').value,
      login: $('#auth-login').value,
      password: $('#auth-password').value,
    });
    $('#auth-password').value = '';
    afterLogin();
  } catch (err) {
    $('#auth-err').textContent = err.message;
  }
});

function afterLogin() {
  $('#me-name').textContent = me.name;
  if (socket.connected) socket.disconnect();
  socket.connect();
  if (!storedHost()) loadLibrary();
}

$('#btn-logout').addEventListener('click', async () => {
  await api('POST', '/api/auth/logout').catch(() => {});
  saveHost(null);
  showAuth();
});

// =================== KUTUBXONA ===================

let tab = 'quizzes';
document.querySelectorAll('.navtabs button').forEach(b => b.addEventListener('click', () => {
  tab = b.dataset.tab;
  loadLibrary();
}));

async function loadLibrary() {
  screen('s-library');
  document.querySelectorAll('.navtabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  $('#tab-quizzes').classList.toggle('hidden', tab !== 'quizzes');
  $('#tab-hw').classList.toggle('hidden', tab !== 'hw');
  try {
    if (tab === 'hw') return await loadHwList();
    const list = await api('GET', '/api/quizzes');
    const mine = list.filter(q => !q.sample);
    const samples = list.filter(q => q.sample);
    $('#quiz-list').innerHTML = mine.length
      ? mine.map((q, i) => quizCard(q, i)).join('')
      : `<div class="empty">${icon('sparkles')}<h3>Hali oʻz viktorinangiz yoʻq</h3><p>“Yangi viktorina” tugmasini bosing yoki pastdagi namunalardan birini ishlating</p></div>`;
    $('#sample-list').innerHTML = samples.map((q, i) => quizCard(q, i + mine.length)).join('');
    $('#samples-title').classList.toggle('hidden', !samples.length);
  } catch (err) {
    toast(err.message);
  }
}

// Har bir viktorina kartasiga oʻz rangi va ikonkasi (id boʻyicha doimiy)
const COVERS = [
  ['#0b3c6b', '#0a7c86', 'bulb'], ['#5b3f9e', '#0a7c86', 'sparkles'], ['#c2410c', '#e21b3c', 'flame'],
  ['#0f766e', '#1eb53a', 'book'], ['#1368ce', '#5b3f9e', 'rocket'], ['#b45309', '#d89e00', 'star'],
  ['#9d174d', '#5b3f9e', 'target'], ['#075985', '#0099b5', 'cap'],
];
function coverFor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COVERS[h % COVERS.length];
}

function quizCard(q, i = 0) {
  const [c1, c2, ic] = coverFor(q.id);
  return `
    <div class="qcard ${q.sample ? 'sample' : ''}" style="--i:${i}">
      <div class="cover" style="--c1:${c1};--c2:${c2}">${icon(ic, 'big-ic')}<span class="chip">${icon('list')} ${q.count} ta savol${q.sample ? ' · namuna' : ''}</span></div>
      <div class="body" ${q.lang === 'other' ? 'data-raw' : ''}><h3>${esc(q.title)}</h3><p>${esc(q.description)}</p></div>
      <div class="actions">
        <button class="btn green" data-act="play" data-id="${q.id}" title="Jonli oʻyin">${icon('play')} Boshlash</button>
        <button class="btn ghost" data-act="hw" data-id="${q.id}" title="Uy vazifasi berish">${icon('homework')}</button>
        ${q.sample ? '' : `<button class="btn ghost" data-act="edit" data-id="${q.id}" title="Tahrirlash">${icon('edit')}</button>`}
        <button class="btn ghost" data-act="copy" data-id="${q.id}" title="${q.sample ? 'Nusxa olib tahrirlash' : 'Nusxa olish'}">${icon('copy')}</button>
        ${q.sample ? '' : `<button class="btn ghost" data-act="del" data-id="${q.id}" title="Oʻchirish">${icon('trash')}</button>`}
      </div>
    </div>`;
}

$('#tab-quizzes').addEventListener('click', async e => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const id = b.dataset.id;
  try {
    if (b.dataset.act === 'play') createGame(id);
    if (b.dataset.act === 'hw') openHwDialog(id, b.closest('.qcard').querySelector('h3').textContent);
    if (b.dataset.act === 'edit') openEditor(await api('GET', `/api/quizzes/${id}`));
    if (b.dataset.act === 'copy') {
      const q = await api('GET', `/api/quizzes/${id}`);
      const copy = await api('POST', '/api/quizzes', { ...q, title: q.sample ? q.title : q.title + ' (nusxa)' });
      if (q.sample) openEditor(copy);
      else loadLibrary();
      toast('Nusxa yaratildi');
    }
    if (b.dataset.act === 'del' && confirmClick(b)) {
      await api('DELETE', `/api/quizzes/${id}`);
      loadLibrary();
    }
  } catch (err) {
    toast(err.message);
  }
});

$('#btn-new').addEventListener('click', () => openEditor({ title: '', description: '', questions: [blankQ('multiple')] }));

$('#import').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    await api('POST', '/api/quizzes', data);
    toast('Viktorina import qilindi');
    loadLibrary();
  } catch (err) {
    toast('Import xatosi: ' + err.message);
  }
});

// =================== MUHARRIR ===================

let draft = null;
let dirty = false;

function blankQ(type) {
  return type === 'truefalse'
    ? { type, text: '', image: '', options: [...TF_OPTS], correct: [0], time: 10, points: 1 }
    : { type: 'multiple', text: '', image: '', options: ['', '', '', ''], correct: [0], time: 20, points: 1 };
}

function openEditor(quiz) {
  draft = JSON.parse(JSON.stringify(quiz));
  // Muharrirda har doim 4 ta javob maydoni koʻrinadi
  for (const q of draft.questions) while (q.type !== 'truefalse' && q.options.length < 4) q.options.push('');
  dirty = false;
  $('#ed-title').value = draft.title;
  $('#ed-desc').value = draft.description || '';
  $('#ed-lang').value = draft.lang === 'other' ? 'other' : 'uz';
  $('#ed-status').textContent = draft.id ? '' : 'Yangi viktorina';
  renderQuestions();
  screen('s-editor');
}

function renderQuestions() {
  $('#ed-questions').innerHTML = draft.questions.map((q, qi) => `
    <div class="card" data-q="${qi}">
      <div class="qe-head">
        <span class="num">${qi + 1}</span>
        <span class="muted type">${icon(q.type === 'truefalse' ? 'checkCircle' : 'list')} ${q.type === 'truefalse' ? 'Toʻgʻri / Notoʻgʻri' : 'Test'}</span>
        <span class="spacer"></span>
        <select data-f="time" title="Vaqt">${TIMES.map(t => `<option value="${t}" ${t === q.time ? 'selected' : ''}>${t} soniya</option>`).join('')}</select>
        <select data-f="points" title="Ball">
          <option value="1" ${q.points === 1 ? 'selected' : ''}>Oddiy ball</option>
          <option value="2" ${q.points === 2 ? 'selected' : ''}>Ikki baravar ball</option>
          <option value="0" ${q.points === 0 ? 'selected' : ''}>Ballsiz</option>
        </select>
        <button class="icon-btn" data-act="up" title="Yuqoriga">${icon('up')}</button>
        <button class="icon-btn" data-act="down" title="Pastga">${icon('down')}</button>
        <button class="icon-btn" data-act="dup" title="Nusxa">${icon('copy')}</button>
        <button class="icon-btn danger" data-act="del" title="Oʻchirish">${icon('trash')}</button>
      </div>
      <textarea class="qe-text" data-f="text" placeholder="Savol matnini kiriting" maxlength="300">${esc(q.text)}</textarea>
      <div class="img-row">
        ${q.image ? `<img class="img-thumb" src="${esc(q.image)}" alt="">` : ''}
        <input class="qe-img" data-f="image" placeholder="Rasm havolasi (ixtiyoriy) — yoki oʻngdagi tugma bilan yuklang" value="${esc(q.image)}">
        <label class="btn ghost small" title="Kompyuterdan rasm yuklash">${icon('image')} Rasm yuklash<input type="file" accept="image/*" data-upload hidden></label>
        ${q.image ? `<button class="icon-btn danger" data-act="noimg" title="Rasmni olib tashlash">${icon('x')}</button>` : ''}
      </div>
      <div class="qe-opts">
        ${q.options.map((o, oi) => `
          <div class="qe-opt a${oi} ${q.type === 'truefalse' ? 'tf' : ''}">
            ${SHAPES[oi]}
            <input type="text" data-opt="${oi}" value="${esc(o)}" placeholder="${oi + 1}-javob${oi > 1 ? ' (ixtiyoriy)' : ''}" maxlength="90" ${q.type === 'truefalse' ? 'readonly' : ''}>
            <button class="tick ${q.correct.includes(oi) ? 'on' : ''}" data-tick="${oi}" title="Toʻgʻri javob deb belgilash">${icon('check')}</button>
          </div>`).join('')}
      </div>
    </div>`).join('');
}

const qEditor = $('#ed-questions');
qEditor.addEventListener('input', e => {
  const card = e.target.closest('[data-q]');
  if (!card) return;
  const q = draft.questions[+card.dataset.q];
  const f = e.target.dataset.f;
  if (f === 'text' || f === 'image') q[f] = e.target.value;
  if (f === 'time' || f === 'points') q[f] = +e.target.value;
  if (e.target.dataset.opt !== undefined) q.options[+e.target.dataset.opt] = e.target.value;
  dirty = true;
});
qEditor.addEventListener('change', async e => {
  const card = e.target.closest('[data-q]');
  if (!card) return;
  const q = draft.questions[+card.dataset.q];
  if (e.target.matches('select')) q[e.target.dataset.f] = +e.target.value;
  if (e.target.dataset.f === 'image') renderQuestions();
  if (e.target.matches('[data-upload]')) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      toast('Rasm yuklanmoqda…', 1500);
      q.image = await uploadImage(file);
      renderQuestions();
      toast('Rasm yuklandi');
    } catch (err) {
      toast(err.message, 4000);
    }
  }
  dirty = true;
});
qEditor.addEventListener('click', e => {
  const card = e.target.closest('[data-q]');
  if (!card) return;
  const qi = +card.dataset.q;
  const q = draft.questions[qi];
  const tick = e.target.closest('[data-tick]');
  if (tick) {
    const oi = +tick.dataset.tick;
    // Toʻgʻri/Notoʻgʻri — faqat bitta javob; testda bir nechta toʻgʻri javob boʻlishi mumkin
    if (q.type === 'truefalse') q.correct = [oi];
    else q.correct = q.correct.includes(oi) ? q.correct.filter(x => x !== oi) : [...q.correct, oi].sort();
    if (!q.correct.length) q.correct = [oi];
    dirty = true;
    return renderQuestions();
  }
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (!act) return;
  const qs = draft.questions;
  if (act === 'up' && qi > 0) [qs[qi - 1], qs[qi]] = [qs[qi], qs[qi - 1]];
  if (act === 'down' && qi < qs.length - 1) [qs[qi + 1], qs[qi]] = [qs[qi], qs[qi + 1]];
  if (act === 'dup') qs.splice(qi + 1, 0, JSON.parse(JSON.stringify(q)));
  if (act === 'noimg') q.image = '';
  if (act === 'del') {
    if (qs.length === 1) return toast('Kamida bitta savol boʻlishi kerak');
    qs.splice(qi, 1);
  }
  dirty = true;
  renderQuestions();
});

// Katta rasmlar yuklashdan oldin kichraytiriladi (telefon rasmlari 5–10 MB boʻladi)
const UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
async function shrinkImage(file) {
  if (UPLOAD_TYPES.includes(file.type) && (file.size < 1.2e6 || file.type === 'image/gif')) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
  } catch {
    if (UPLOAD_TYPES.includes(file.type)) return file;
    throw new Error('Bu rasm formatini ochib boʻlmadi. PNG yoki JPG tanlang');
  }
}
async function uploadImage(file) {
  const blob = await shrinkImage(file);
  const res = await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Rasm yuklanmadi');
  return data.url;
}

function addQuestion(type) {
  draft.questions.push(blankQ(type));
  dirty = true;
  renderQuestions();
  const cards = qEditor.querySelectorAll('[data-q]');
  const last = cards[cards.length - 1];
  last.scrollIntoView({ behavior: 'smooth', block: 'center' });
  last.querySelector('textarea').focus({ preventScroll: true });
}
$('#add-mc').addEventListener('click', () => addQuestion('multiple'));
$('#add-tf').addEventListener('click', () => addQuestion('truefalse'));
$('#ed-title').addEventListener('input', e => { draft.title = e.target.value; dirty = true; });
$('#ed-desc').addEventListener('input', e => { draft.description = e.target.value; dirty = true; });
$('#ed-lang').addEventListener('change', e => { draft.lang = e.target.value; dirty = true; });

// Boʻsh qolgan 3- va 4-javoblarni olib tashlab, toʻgʻri javob indekslarini moslash
function prepareForSave(d) {
  const out = JSON.parse(JSON.stringify(d));
  out.questions = out.questions.map(q => {
    if (q.type === 'truefalse') return q;
    const keep = q.options.map((o, i) => ({ o: o.trim(), i })).filter((x, idx) => x.o || idx < 2);
    return { ...q, options: keep.map(x => x.o), correct: q.correct.map(c => keep.findIndex(x => x.i === c)).filter(c => c >= 0) };
  });
  return out;
}

$('#ed-save').addEventListener('click', async () => {
  try {
    const body = prepareForSave(draft);
    const saved = draft.id ? await api('PUT', `/api/quizzes/${draft.id}`, body) : await api('POST', '/api/quizzes', body);
    draft.id = saved.id;
    dirty = false;
    toast('Saqlandi');
    $('#ed-status').textContent = 'Saqlandi';
  } catch (err) {
    toast(err.message, 4000);
  }
});

$('#ed-back').addEventListener('click', e => {
  if (dirty && !confirmClick(e.currentTarget, 'Saqlanmagan! Yana bosing')) return;
  loadLibrary();
});

$('#ed-export').addEventListener('click', () => {
  const { id, ownerId, updatedAt, sample, ...data } = prepareForSave(draft);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (draft.title || 'viktorina').replace(/[^\p{L}\p{N}]+/gu, '-') + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
});

// =================== UY VAZIFASI ===================

let hwQuizId = null;
let hwId = null;
let hwPoll = null;

const pad = n => String(n).padStart(2, '0');
const toLocalInput = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

function openHwDialog(quizId, title) {
  hwQuizId = quizId;
  $('#hw-quiz-title').textContent = title;
  $('#hw-deadline').value = '';
  $('#hw-deadline').min = toLocalInput(new Date());
  $('#hw-err').textContent = '';
  $('#hw-dialog').showModal();
}
document.querySelectorAll('[data-dl]').forEach(b => b.addEventListener('click', () => {
  const d = new Date();
  if (b.dataset.dl === 'none') return ($('#hw-deadline').value = '');
  if (b.dataset.dl === 'tomorrow') d.setDate(d.getDate() + 1);
  if (b.dataset.dl === 'week') d.setDate(d.getDate() + 7);
  d.setHours(23, 59, 0, 0);
  $('#hw-deadline').value = toLocalInput(d);
}));
$('#hw-cancel').addEventListener('click', () => $('#hw-dialog').close());
$('#f-hw').addEventListener('submit', async e => {
  e.preventDefault();
  const v = $('#hw-deadline').value;
  try {
    const a = await api('POST', '/api/assignments', { quizId: hwQuizId, deadline: v ? new Date(v).getTime() : null });
    $('#hw-dialog').close();
    openHw(a.id);
  } catch (err) {
    $('#hw-err').textContent = err.message;
  }
});

const isClosed = a => a.deadline && Date.now() > a.deadline;

async function loadHwList() {
  const list = await api('GET', '/api/assignments');
  $('#hw-list').innerHTML = list.length
    ? list.map((a, i) => `
      <div class="hw-item" data-id="${a.id}" style="--i:${i}">
        <span class="hw-ic">${icon('homework')}</span>
        <div class="grow">
          <h3>${esc(a.title)}</h3>
          <div class="muted">${fmtDate(a.createdAt)} · ${a.total} ta savol · <b>${a.finished}</b> ta topshirdi${a.started > a.finished ? ` · ${a.started - a.finished} ta jarayonda` : ''}</div>
        </div>
        <span class="status ${isClosed(a) ? 'closed' : ''}">${icon(isClosed(a) ? 'ban' : a.deadline ? 'clock' : 'check')} ${isClosed(a) ? 'Yopilgan' : a.deadline ? 'Muddat: ' + fmtDate(a.deadline) : 'Ochiq'}</span>
      </div>`).join('')
    : `<div class="empty">${icon('homework')}<h3>Hali uy vazifasi berilmagan</h3><p>“Viktorinalar” boʻlimida kartadagi ${icon('homework')} tugmasini bosing</p></div>`;
}
$('#hw-list').addEventListener('click', e => {
  const item = e.target.closest('.hw-item');
  if (item) openHw(item.dataset.id);
});

async function openHw(id) {
  hwId = id;
  $('#hw-results').innerHTML = '';
  $('#hw-qstats').innerHTML = '';
  $('#hw-qr').removeAttribute('src');
  screen('s-hw');
  await refreshHw();
  clearInterval(hwPoll);
  // Oʻquvchilar topshirgan sari natijalar avtomatik yangilanadi
  hwPoll = setInterval(() => {
    if (document.querySelector('#s-hw:not(.hidden)')) refreshHw();
    else clearInterval(hwPoll);
  }, 8000);
}

async function refreshHw() {
  let a;
  try {
    a = await api('GET', `/api/assignments/${hwId}`);
  } catch (err) {
    toast(err.message);
    return loadLibrary();
  }
  Translit.markRaw(a.raw, $('#hw-title'), $('#hw-qstats'));
  $('#hw-title').textContent = a.title;
  $('#hw-link').textContent = a.link;
  const qr = '/api/qr?text=' + encodeURIComponent(a.link);
  if ($('#hw-qr').getAttribute('src') !== qr) $('#hw-qr').src = qr;
  $('#hw-telegram').href = `https://t.me/share/url?url=${encodeURIComponent(a.link)}&text=${encodeURIComponent('Uy vazifasi: ' + a.title)}`;
  $('#hw-csv').href = `/api/assignments/${a.id}/results.csv`;
  $('#hw-deadline-icon').innerHTML = icon(isClosed(a) ? 'ban' : a.deadline ? 'clock' : 'calendar');
  $('#hw-deadline-info').textContent = a.deadline
    ? (isClosed(a) ? 'Muddat tugagan: ' : 'Topshirish muddati: ') + fmtDate(a.deadline)
    : 'Muddatsiz — siz oʻchirmaguningizcha ochiq';
  $('#hw-stats').textContent = `${a.finished} ta topshirdi` + (a.started > a.finished ? ` · ${a.started - a.finished} ta jarayonda` : '');
  $('#hw-results').innerHTML = a.results.length
    ? `<table class="results"><tr><th>#</th><th>Ism</th><th>Toʻgʻri</th><th>Ball</th><th>Holat</th></tr>${a.results.map(r => `
        <tr><td>${r.finishedAt ? r.rank : '–'}</td><td>${esc(r.name)}</td><td>${r.correctCount}/${a.total}</td><td>${fmt(r.score)}</td>
        <td class="muted">${r.finishedAt ? icon('checkCircle') + ' ' + fmtDate(r.finishedAt) : `${icon('hourglass', 'wait')} ${r.answered}/${a.total}`}</td></tr>`).join('')}</table>`
    : '<p class="muted">Hali hech kim topshirmadi. Havolani oʻquvchilarga yuboring.</p>';
  const firstStats = !$('#hw-qstats').children.length;
  $('#hw-qstats').innerHTML = a.questionStats.map((s, i) => {
    const cls = s.correctPct === null ? '' : s.correctPct < 40 ? 'low' : s.correctPct < 70 ? 'mid' : '';
    return `<div class="qstat"><b>${i + 1}</b><div>${esc(s.text)}<div class="track"><div class="${cls}" data-w="${s.correctPct ?? 0}" style="width:${firstStats ? 0 : s.correctPct ?? 0}%"></div></div></div>
      <span class="pct">${s.correctPct === null ? '–' : s.correctPct + '%'}</span></div>`;
  }).join('');
  if (firstStats) requestAnimationFrame(() => requestAnimationFrame(() =>
    $('#hw-qstats').querySelectorAll('[data-w]').forEach(el => (el.style.width = el.dataset.w + '%'))));
}

$('#hw-back').addEventListener('click', () => {
  clearInterval(hwPoll);
  tab = 'hw';
  loadLibrary();
});
$('#hw-copy').addEventListener('click', async () => {
  const text = $('#hw-link').textContent;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // http:// orqali ochilganda clipboard API ishlamaydi — eski usul
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('Havola nusxalandi');
});
$('#hw-delete').addEventListener('click', async e => {
  if (!confirmClick(e.currentTarget, 'Natijalar ham oʻchadi! Yana bosing')) return;
  await api('DELETE', `/api/assignments/${hwId}`).catch(err => toast(err.message));
  clearInterval(hwPoll);
  tab = 'hw';
  loadLibrary();
});

// =================== JONLI OʻYIN ===================

function saveHost(g) {
  game = g;
  try { g ? sessionStorage.setItem(HOST_STORE, JSON.stringify(g)) : sessionStorage.removeItem(HOST_STORE); } catch {}
}
function storedHost() {
  try { return game || JSON.parse(sessionStorage.getItem(HOST_STORE)); } catch { return null; }
}

async function showJoinInfo(pin) {
  try {
    const { joinUrl } = await api('GET', '/api/info');
    $('#join-url').textContent = joinUrl.replace(/^https?:\/\//, '');
    $('#qr').src = '/api/qr?text=' + encodeURIComponent(`${joinUrl}/?pin=${pin}`);
  } catch {}
}

function showLobby(g, title, players, teamCount = 0, locked = false) {
  Translit.markRaw(g.raw, $('#lobby-title'));
  $('#lobby-pin').textContent = g.pin.replace(/(\d{3})(\d{3})/, '$1 $2');
  $('#lobby-title').textContent = title;
  $('#team-mode').value = String(teamCount);
  setLockLabel(locked);
  renderLobby(players);
  screen('s-lobby');
  showJoinInfo(g.pin);
}

function createGame(quizId) {
  if (!socket.connected) return toast('Server bilan aloqa yoʻq. Sahifani yangilang');
  socket.emit('host:create', { quizId }, res => {
    if (res.error) return toast(res.error);
    saveHost(res);
    showLobby(res, res.title, []);
  });
}

function renderLobby(players) {
  $('#p-count').textContent = players.length;
  $('#btn-start').disabled = players.length === 0;
  const box = $('#players');
  const known = new Set([...box.querySelectorAll('.player')].map(e => e.dataset.id));
  box.innerHTML = players.length ? '' : `<div class="waiting">${icon('users')}<span class="dots">Ishtirokchilar kutilmoqda</span></div>`;
  for (const p of players) {
    const el = document.createElement('div');
    el.className = 'player' + (p.connected ? '' : ' off');
    if (known.has(p.id)) el.style.animation = 'none';
    el.dataset.id = p.id;
    el.title = 'Bosing — oʻyindan chiqarish';
    el.textContent = p.name;
    box.appendChild(el);
  }
}

socket.on('lobby:players', players => {
  const before = +$('#p-count').textContent;
  renderLobby(players);
  if (players.length > before) Sound.beep(740 + Math.random() * 200, 0.1, 'triangle');
});
$('#players').addEventListener('click', e => {
  const p = e.target.closest('.player');
  if (p) socket.emit('host:kick', p.dataset.id);
});
$('#team-mode').addEventListener('change', e => socket.emit('host:teams', +e.target.value));
$('#btn-start').addEventListener('click', () => socket.emit('host:start'));

function setLockLabel(locked) {
  const b = $('#btn-lock');
  b.dataset.locked = locked ? '1' : '';
  b.innerHTML = locked ? `${icon('lock')} Qulflangan` : `${icon('unlock')} Ochiq`;
}
$('#btn-lock').addEventListener('click', () => {
  const locked = !$('#btn-lock').dataset.locked;
  setLockLabel(locked);
  socket.emit('host:lock', locked);
});
$('#btn-sound').addEventListener('click', () => {
  Sound.on = !Sound.on;
  $('#btn-sound').innerHTML = icon(Sound.on ? 'sound' : 'mute');
});

socket.on('q:getready', d => {
  clearInterval(timerInt);
  $('#ready-num').textContent = `${d.index + 1}-savol / ${d.total}`;
  Translit.markRaw(d.raw, $('#ready-text'));
  $('#ready-text').textContent = d.text;
  $('#ready-double').classList.toggle('hidden', d.points !== 2);
  const bar = document.querySelector('.ready-bar');
  bar.classList.remove('go'); void bar.offsetWidth; bar.classList.add('go');
  screen('s-ready');
});

socket.on('q:show', d => {
  const endsAt = Date.now() + d.remaining;
  $('#q-num').textContent = `${d.index + 1} / ${d.total}`;
  Translit.markRaw(d.raw, $('#q-text'), $('#tiles'));
  $('#q-text').textContent = d.text;
  const img = $('#q-img');
  img.classList.toggle('hidden', !d.image);
  if (d.image) img.src = d.image;
  $('#chart').classList.add('hidden');
  $('#ans-count').textContent = 0;
  $('#btn-skip').classList.remove('hidden');
  $('#btn-next').classList.add('hidden');
  $('#tiles').innerHTML = d.options.map((o, i) =>
    `<div class="tile a${i}">${SHAPES[i]}<span class="txt">${esc(o)}</span><span class="mark-ic"></span></div>`).join('');
  screen('s-question');

  // Taymer halqasi: --p (100 → 0) vaqt bilan birga kamayadi
  const t = $('#timer');
  const ring = $('#timer-ring');
  ring.classList.remove('low');
  clearInterval(timerInt);
  let lastLeft = null;
  const tick = () => {
    const ms = Math.max(0, endsAt - Date.now());
    const left = Math.ceil(ms / 1000);
    t.textContent = left;
    ring.style.setProperty('--p', (ms / (d.time * 1000)) * 100);
    ring.classList.toggle('low', left <= 5 && left > 0);
    if (left !== lastLeft && left <= 5 && left > 0) Sound.tick();
    lastLeft = left;
    if (left <= 0) clearInterval(timerInt);
  };
  tick();
  timerInt = setInterval(tick, 200);
});

socket.on('q:answers', d => {
  const el = $('#ans-count');
  el.textContent = d.answered;
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
});

socket.on('q:reveal', d => {
  clearInterval(timerInt);
  $('#timer').textContent = '0';
  $('#timer-ring').classList.remove('low');
  $('#timer-ring').style.setProperty('--p', 0);
  $('#ans-count').textContent = d.answered;
  $('#btn-skip').classList.add('hidden');
  $('#btn-next').classList.remove('hidden');
  $('#btn-next').innerHTML = d.isLast ? `Natijalar ${icon('trophy')}` : `Keyingi ${icon('next')}`;
  document.querySelectorAll('#tiles .tile').forEach((el, i) => {
    const ok = d.correct.includes(i);
    el.classList.toggle('dim', !ok);
    el.querySelector('.mark-ic').innerHTML = icon(ok ? 'check' : 'x');
    el.classList.toggle('win', ok);
  });
  // Javoblar diagrammasi
  $('#q-img').classList.add('hidden');
  const chart = $('#chart');
  const max = Math.max(1, ...d.counts);
  chart.innerHTML = d.counts.map((c, i) => `
    <div class="bar ${d.correct.includes(i) ? '' : 'dim'}">
      <div class="fill a${i}" data-h="${(c / max) * 100}"></div>
      <div class="lbl a${i}">${SHAPES[i]}${c}</div>
    </div>`).join('');
  chart.classList.remove('hidden');
  requestAnimationFrame(() => requestAnimationFrame(() =>
    chart.querySelectorAll('.fill').forEach(f => (f.style.height = `calc(${f.dataset.h}% - 40px)`))));
  Sound.beep(520, 0.25, 'triangle');
});

$('#btn-skip').addEventListener('click', () => socket.emit('host:skip'));
$('#btn-next').addEventListener('click', () => socket.emit('host:next'));
$('#btn-board-next').addEventListener('click', () => socket.emit('host:next'));
$('#btn-end-early').addEventListener('click', e => {
  if (confirmClick(e.currentTarget, 'Yakunlansinmi?')) socket.emit('host:end');
});

socket.on('leaderboard', d => {
  $('#btn-board-next').innerHTML = d.isLast ? `Natijalar ${icon('trophy')}` : `Keyingi savol ${icon('next')}`;
  $('#board-title').textContent = d.teams ? 'Jamoalar reytingi' : 'Reyting';
  const rows = d.teams
    ? d.teams.map((t, i) => `<div class="brow team a${t.index}" style="animation-delay:${i * 0.12}s"><span class="rk">${t.rank}</span><span class="nm">${i === 0 ? icon('trophy') : icon('users')}${esc(t.name)}<span class="team-members">${t.members} kishi</span></span><span class="sc" data-v="${t.score}">0</span></div>`)
    : d.top.map((p, i) => `<div class="brow" style="animation-delay:${i * 0.12}s"><span class="rk">${p.rank}</span><span class="nm">${i === 0 ? icon('trophy') : ''}${esc(p.name)}</span><span class="sc" data-v="${p.score}">0</span></div>`);
  $('#board').innerHTML = rows.join('') || `<div class="waiting">${icon('users')}Ishtirokchilar yoʻq</div>`;
  screen('s-board');
  // Ballar sanab chiqadi
  $('#board').querySelectorAll('.sc').forEach((el, i) => setTimeout(() => countUp(el, +el.dataset.v, { ms: 1000 }), 250 + i * 120));
});

socket.on('game:end', d => {
  clearInterval(timerInt);
  if (game) game.ended = true;
  const order = [1, 0, 2]; // 2-oʻrin, 1-oʻrin, 3-oʻrin
  const podium = d.teams
    ? d.teams.slice(0, 3).map(t => ({ name: t.name, sub: `${fmt(t.score)} ball (oʻrtacha) · ${t.members} kishi` }))
    : d.podium.map(p => ({ name: p.name, sub: `${fmt(p.score)} ball · ${p.correctCount} toʻgʻri` }));
  $('#end-title').textContent = d.teams ? 'Gʻolib jamoalar' : 'Gʻoliblar';
  $('#podium').innerHTML = order.filter(i => podium[i]).map(i => `
    <div class="step p${i + 1}">
      <div class="who">${esc(podium[i].name)}</div>
      <div class="pts">${podium[i].sub}</div>
      <div class="block">${medal(i + 1)}</div>
    </div>`).join('') || `<div class="waiting">${icon('users')}Ishtirokchilar yoʻq</div>`;
  const teamName = p => (d.teams && p.team != null ? d.teams.find(t => t.index === p.team)?.name : '');
  $('#full-results').innerHTML = `<table class="results"><tr><th>#</th><th>Ism</th>${d.teams ? '<th>Jamoa</th>' : ''}<th>Toʻgʻri</th><th>Ball</th></tr>${
    d.all.map(p => `<tr><td>${p.rank}</td><td>${esc(p.name)}</td>${d.teams ? `<td>${esc(teamName(p))}</td>` : ''}<td>${p.correctCount}/${game.total}</td><td>${fmt(p.score)}</td></tr>`).join('')}</table>`;
  $('#full-results').classList.add('hidden');
  $('#btn-csv').href = `/api/games/${game.pin}/results.csv?token=${game.hostToken}`;
  screen('s-end');
  setTimeout(() => {
    Sound.fanfare();
    if (podium.length) confetti({ count: 220, duration: 4500 });
  }, 1400);
});

$('#btn-full').addEventListener('click', () => $('#full-results').classList.toggle('hidden'));
$('#btn-home').addEventListener('click', () => { saveHost(null); loadLibrary(); });

// Sahifa yangilansa yoki aloqa uzilsa — oʻyinga qaytish
socket.on('connect', () => {
  const g = storedHost();
  if (!g) return;
  socket.emit('host:rejoin', { pin: g.pin, hostToken: g.hostToken }, res => {
    if (res.error) {
      saveHost(null);
      return loadLibrary();
    }
    game = g;
    game.raw = res.raw;
    if (res.state === 'lobby') showLobby(g, res.title, res.players, res.teamCount, res.locked);
  });
});

window.addEventListener('beforeunload', e => {
  // Faqat oʻyin davom etayotganda ogohlantirish
  if (game && !game.ended && !document.body.classList.contains('light')) e.preventDefault();
});

// Ishga tushish: avval kim kirganini aniqlaymiz
(async () => {
  try {
    me = await api('GET', '/api/me');
    afterLogin();
  } catch {
    // showAuth() api() ichida chaqirilgan
  }
})();
