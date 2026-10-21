// Uy vazifasi — oʻquvchi oʻz tezligida topshiradi (vaqt va ball server tomonidan hisoblanadi)
const code = new URLSearchParams(location.search).get('k') || '';
const STORE = `bilimdon-hw-${code}`;
let attemptId = null;
let timerInt = null;
let busy = false;

async function api(path, body) {
  const opts = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  const res = await fetch(`/api/hw/${encodeURIComponent(code)}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Xatolik yuz berdi');
  return data;
}
const fmtDate = t => new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

async function init() {
  let info;
  try {
    info = await api('');
  } catch (err) {
    $('#hw-title').textContent = 'Topilmadi';
    $('#start-fields').classList.add('hidden');
    $('#start-err').textContent = err.message;
    return;
  }
  Translit.markRaw(info.raw, $('#hw-title'), $('#hw-desc'));
  $('#hw-title').textContent = info.title;
  $('#hw-desc').textContent = info.description || '';
  $('#hw-count').textContent = `${info.total} ta savol`;
  $('#hw-deadline-wrap').classList.toggle('hidden', !info.deadline);
  if (info.deadline) $('#hw-deadline').textContent = `${fmtDate(info.deadline)} gacha`;

  // Avval boshlangan boʻlsa — davom ettirish
  try { attemptId = localStorage.getItem(STORE); } catch {}
  if (attemptId) {
    try {
      await api('/start', { attemptId });
      return next();
    } catch {
      attemptId = null;
    }
  }
  if (info.closed) {
    $('#start-fields').classList.add('hidden');
    $('#start-err').textContent = 'Topshirish muddati tugagan';
  } else {
    $('#name').focus();
  }
}

$('#f-start').addEventListener('submit', async e => {
  e.preventDefault();
  $('#start-err').textContent = '';
  try {
    const r = await api('/start', { name: $('#name').value });
    attemptId = r.attemptId;
    try { localStorage.setItem(STORE, attemptId); } catch {}
    next();
  } catch (err) {
    $('#start-err').textContent = err.message;
  }
});

async function next() {
  let d;
  try {
    d = await api('/next', { attemptId });
  } catch (err) {
    return toast(err.message);
  }
  if (d.done) return done(d);
  showQuestion(d);
}

function showQuestion(d) {
  busy = false;
  const endsAt = Date.now() + d.remaining;
  Translit.markRaw(d.raw, $('#q-text'), $('#answers'));
  $('#q-num').textContent = `${d.index + 1} / ${d.total}`;
  $('#q-progress').style.width = `${(d.index / d.total) * 100}%`;
  $('#q-text').textContent = d.text;
  const img = $('#q-img');
  img.classList.toggle('hidden', !d.image);
  if (d.image) img.src = d.image;
  const box = $('#answers');
  box.className = 'answers' + (d.options.length === 2 ? ' tf' : '');
  box.innerHTML = d.options.map((o, i) =>
    `<button class="ans a${i}" data-i="${i}">${SHAPES[i]}<span>${esc(o)}</span></button>`).join('');
  box.querySelectorAll('.ans').forEach(b => b.addEventListener('click', () => answer(+b.dataset.i)));
  $('#feedback').classList.add('hidden');
  $('#fb-title').classList.remove('shake');
  show('s-q');
  window.scrollTo(0, 0);

  clearInterval(timerInt);
  const t = $('#q-timer');
  const tick = () => {
    const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    t.textContent = left;
    $('#q-timer-wrap').classList.toggle('low', left <= 5 && left > 0);
    if (left <= 0) answer(null); // vaqt tugadi
  };
  tick();
  timerInt = setInterval(tick, 250);
}

async function answer(choice) {
  if (busy) return;
  busy = true;
  clearInterval(timerInt);
  if (choice !== null && navigator.vibrate) navigator.vibrate(30);
  let r;
  try {
    r = await api('/answer', { attemptId, choice });
  } catch (err) {
    toast(err.message);
    return next();
  }
  document.querySelectorAll('#answers .ans').forEach((b, i) => {
    b.disabled = true;
    b.classList.toggle('dim', !r.correctIdx.includes(i));
    b.classList.toggle('picked', i === choice);
  });
  const fb = $('#feedback');
  fb.className = 'feedback ' + (r.correct ? 'good' : 'bad');
  $('#fb-title').innerHTML = r.correct
    ? `${icon('checkCircle')} Toʻgʻri! <span></span>`
    : r.answered ? `${icon('xCircle')} Notoʻgʻri` : `${icon('clock')} Vaqt tugadi`;
  if (r.correct) countUp($('#fb-title span'), r.points, { prefix: '+', suffix: ' ball', ms: 700 });
  else $('#fb-title').classList.add('shake');
  $('#fb-sub').innerHTML = r.correct
    ? (r.streak > 1 ? `${icon('flame')} Ketma-ket ${r.streak} ta toʻgʻri javob!` : `Jami: ${fmt(r.score)} ball`)
    : `Toʻgʻri javob: <b ${$('#answers').hasAttribute('data-raw') ? 'data-raw' : ''}>${esc(r.correctText)}</b>`;
  $('#btn-next').innerHTML = r.isLast ? `Natijani koʻrish ${icon('flag')}` : `Keyingi savol ${icon('next')}`;
  $('#btn-next').onclick = () => (r.final ? done(r.final) : next());
  r.correct ? Sound.good() : Sound.bad();
  $('#q-progress').style.width = `${((+$('#q-num').textContent.split('/')[0]) / +$('#q-num').textContent.split('/')[1]) * 100}%`;
  fb.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function done(d) {
  clearInterval(timerInt);
  $('#d-score').innerHTML = `${icon('star')} <span></span>`;
  $('#d-correct').innerHTML = `${icon('check')} ${d.correctCount}/${d.total} toʻgʻri`;
  $('#d-rank').textContent = d.finishedCount > 1
    ? `Hozircha ${d.finishedCount} ta oʻquvchi orasida ${d.rank}-oʻrindasiz`
    : 'Siz birinchi boʻlib topshirdingiz!';
  show('s-done');
  countUp($('#d-score span'), d.score, { suffix: ' ball', ms: 1400 });
  Sound.fanfare();
  if (d.correctCount / d.total >= 0.6) setTimeout(() => confetti(), 300);
}

init();
