// Oʻz oʻyini — oʻquvchi telefoni. Kutish zali va jamoa tanlash umumiy (zk-play.js).
let bpInt = null;
let bpTimerKey = null;

const bpSigned = n => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '±0');
const bpResults = results => results.map(r =>
  `<span class="bd-res ${r.delta > 0 ? 'plus' : r.delta < 0 ? 'minus' : ''}"><span class="team-chip t${r.color}">${esc(r.name)}</span><b>${bpSigned(r.delta)}</b></span>`).join('');
const bpStanding = t => t.rank === 1
  ? `${icon('trophy')} ${esc(t.name)} — birinchi oʻrinda!`
  : `${esc(t.name)} — ${t.rank}-oʻrin (${t.teams} ta jamoadan)`;

function bpRender(v) {
  document.querySelectorAll('.bp-score').forEach(e => (e.textContent = `${fmt(v.team.score)} ball`));
  if (v.state !== 'question') clearInterval(bpInt);
  if (v.state === 'board') return bpWait(v);
  if (v.state === 'reveal') return bpResult(v);
  bpQuestion(v); // question, cat, luck
}

// --- Doska: kimning navbati ---
function bpWait(v) {
  const t = v.team;
  const box = $('#bw-turn');
  box.className = `bp-turn ${v.myTurn ? `mine t${t.color}` : ''}`;
  box.innerHTML = v.myTurn
    ? `${icon('star')}<b>Sizning navbatingiz!</b><span>Jamoa bilan katakcha tanlang va oʻqituvchiga ayting</span>`
    : `${icon('hourglass')}<b>Navbat: ${esc(v.turnName)}</b><span>Ular katakcha tanlamoqda</span>`;
  if (v.myTurn && zpOnce(`turn:${v.left}`) && navigator.vibrate) navigator.vibrate([60, 60, 60]);
  $('#bw-standing').innerHTML = bpStanding(t);
  $('#bw-left').textContent = `${v.left} ta savol qoldi`;
  show('b-wait');
}

// --- Savol ---
function bpQuestion(v) {
  const c = v.cur;
  const t = v.team;
  const mine = c.answering === t.id;
  $('#bq-tag').textContent = `${c.topic} · ${c.value}`;
  const banner = $('#bq-banner');
  if (v.state === 'cat') {
    banner.className = 'bp-banner cat';
    banner.innerHTML = `${icon('cat')}<div><b>Mushuk qopda!</b><span>${esc(v.turnName)} savolni boshqa jamoaga beradi</span></div>`;
  } else if (v.state === 'luck') {
    banner.className = 'bp-banner luck';
    banner.innerHTML = `${icon('gift')}<div><b>Omad!</b><span>${esc(v.turnName)} savolsiz ${bpSigned(c.value)} ball oldi</span></div>`;
  } else {
    banner.className = `bp-banner ${mine ? `mine t${t.color}` : ''}`;
    banner.innerHTML = mine
      ? `${icon('users')}<div><b>Jamoangiz javob beradi!</b><span>Maslahatlashing va javobni ovoz chiqarib ayting${c.cat ? ' · xato uchun ball ayirilmaydi' : ''}</span></div>`
      : `${icon('hourglass')}<div><b>${esc(c.answeringName)} javob bermoqda</b><span>Ular xato qilsa, savol keyingi jamoaga oʻtishi mumkin</span></div>`;
  }
  const isQ = v.state === 'question';
  Translit.markRaw(v.raw, $('#bq-text'));
  $('#bq-text').classList.toggle('hidden', !isQ);
  $('#bq-text').textContent = isQ ? c.text : '';
  $('#bq-img').classList.toggle('hidden', !isQ || !c.image);
  if (isQ && c.image) $('#bq-img').src = c.image;
  $('#bq-timer-wrap').classList.toggle('hidden', !isQ);
  $('#bq-results').innerHTML = bpResults(c.results);

  const key = `${c.ti}:${c.ci}:${c.answering}:${v.state}`;
  if (key !== bpTimerKey) {
    bpTimerKey = key;
    if (isQ && mine && navigator.vibrate) navigator.vibrate([80, 60, 80]);
    if (v.state === 'luck' && c.results.some(r => r.team === t.id)) {
      Sound.fanfare();
      confetti({ count: 80, duration: 2000 });
    }
    if (isQ) bpRunTimer(c);
  }
  show('b-q');
}

function bpRunTimer(c) {
  const endsAt = Date.now() + c.endsIn;
  clearInterval(bpInt);
  const tick = () => {
    const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    $('#bq-timer').textContent = left;
    $('#bq-timer-wrap').classList.toggle('low', left <= 5);
    if (left <= 0) clearInterval(bpInt);
  };
  tick();
  bpInt = setInterval(tick, 250);
}

// --- Toʻgʻri javob ---
function bpResult(v) {
  const c = v.cur;
  const t = v.team;
  const delta = c.results.filter(r => r.team === t.id).reduce((n, r) => n + r.delta, 0);
  const winner = c.results.find(r => r.delta > 0);
  const box = $('#b-result');
  box.className = `screen ${zpShown('b-result') ? '' : 'hidden'} ${delta > 0 ? 'good' : delta < 0 ? 'bad' : ''}`;
  $('#br-icon').innerHTML = icon(delta > 0 ? 'checkCircle' : delta < 0 ? 'xCircle' : winner ? 'users' : 'clock');
  $('#br-title').textContent = delta > 0 ? `Toʻgʻri! ${bpSigned(delta)}`
    : delta < 0 ? `Notoʻgʻri ${bpSigned(delta)}`
    : winner ? `${winner.name} topdi` : 'Hech kim topmadi';
  Translit.markRaw(v.raw, $('#br-answer'), $('#br-comment'));
  $('#br-answer').innerHTML = `${icon('bulb')} Javob: <b>${esc(c.answer)}</b>`;
  $('#br-comment').classList.toggle('hidden', !c.comment);
  $('#br-comment').textContent = c.comment;
  $('#br-results').innerHTML = bpResults(c.results);
  $('#br-standing').innerHTML = bpStanding(t);
  if (zpOnce(`result:${c.ti}:${c.ci}`)) {
    if (delta > 0) Sound.good();
    else if (delta < 0) Sound.bad();
    if (navigator.vibrate && delta) navigator.vibrate(delta > 0 ? [40, 40, 40] : 200);
    $('#br-icon').classList.toggle('shake', delta < 0);
  }
  show('b-result');
}

// --- Yakun ---
function bpEnd(v) {
  clearInterval(bpInt);
  const t = v.team;
  if (!t) {
    $('#ze-medal').innerHTML = icon('flag');
    $('#ze-rank').textContent = '';
    $('#ze-title').textContent = 'Oʻyin tugadi';
    $('#ze-score').classList.add('hidden');
  } else {
    $('#ze-medal').innerHTML = t.rank <= 3 ? medal(t.rank) : icon('target');
    $('#ze-medal').classList.toggle('gold', t.rank === 1);
    $('#ze-rank').textContent = t.rank;
    $('#ze-title').textContent = t.rank === 1 ? `${t.name} — gʻolib jamoa!` : `${t.name} · ${t.teams} ta jamoa orasida`;
    $('#ze-score').classList.remove('hidden');
    $('#ze-score').innerHTML = `${icon('star')} ${fmt(t.score)} ball`;
    if (zpOnce('end') && t.rank <= 3) {
      Sound.fanfare();
      setTimeout(() => confetti(), 300);
    }
  }
  saveSession(null);
  show('z-end');
}
