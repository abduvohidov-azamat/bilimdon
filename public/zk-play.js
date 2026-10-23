// Zakovat — oʻquvchi telefoni. Server har oʻzgarishda shu oʻquvchiga moʻljallangan holatni ('zk:p') yuboradi.
let zp = null; // oxirgi holat
let zpInt = null;
let zpPicking = false; // kutish zalida jamoani almashtirmoqda
let zpQ = null; // ekrandagi savol raqami
const zpDone = new Set(); // ovoz/tebranish bir marta

const zpShown = id => !$('#' + id).classList.contains('hidden');
const zpOnce = key => !zpDone.has(key) && zpDone.add(key);

socket.on('zk:p', v => {
  zp = v;
  setName(v.name);
  zpTeamChips(v);
  if (v.state !== 'think') clearInterval(zpInt);
  if (v.state === 'ended') return v.kind === 'board' ? bpEnd(v) : zpEnd(v);
  if (!v.team || (zpPicking && v.state === 'lobby')) return zpPick(v);
  if (v.state === 'lobby') return zpLobby(v);
  if (v.kind === 'board') return bpRender(v); // Oʻz oʻyini — board-play.js
  if (v.state === 'read' || v.state === 'think') return zpQuestion(v);
  if (v.state === 'judge') return zpWait(v);
  zpResult(v); // reveal, table
});

function zpTeamChips(v) {
  document.querySelectorAll('.zk-me-team').forEach(e => {
    e.classList.toggle('hidden', !v.team);
    if (v.team) {
      e.className = `team-chip zk-me-team t${v.team.color}`;
      e.textContent = v.team.name;
    }
  });
  document.querySelectorAll('.zk-me-role').forEach(e => (e.innerHTML = v.team?.isCaptain ? `${icon('star')} Sardor` : ''));
}

// --- Jamoa tanlash ---
function zpPick(v) {
  const box = $('#zp-choices');
  box.innerHTML = v.choices
    ? v.choices.map(c => `<button class="zp-choice t${c.color} ${v.team?.id === c.id ? 'on' : ''}" data-id="${c.id}">
        <span>${esc(c.name)}</span><small>${icon('users')} ${c.count}</small></button>`).join('')
    : '<p>Oʻqituvchi sizni jamoaga qoʻshishini kuting…</p>';
  show('z-pick');
}
$('#zp-choices').addEventListener('click', e => {
  const b = e.target.closest('.zp-choice');
  if (!b) return;
  if (navigator.vibrate) navigator.vibrate(30);
  socket.emit('zk:pick', +b.dataset.id, res => {
    if (res && res.error) return toast(res.error);
    zpPicking = false;
  });
});
$('#zl-change').addEventListener('click', () => {
  zpPicking = true;
  zpPick(zp);
});

// --- Kutish zali ---
function zpLobby(v) {
  const t = v.team;
  $('#zl-team').innerHTML = `<div class="zp-team-name t${t.color}">${esc(t.name)}</div>
    <div class="zp-members">${t.members.map(n => `<span class="${n === t.captain ? 'cap' : ''}">${n === t.captain ? icon('star') : ''}${esc(n)}</span>`).join('')}</div>`;
  $('#zl-role').innerHTML = !v.captains
    ? 'Savollarga jamoangiz bilan birga javob berasiz'
    : t.isCaptain
      ? `${icon('star')} Siz sardorsiz! Jamoa javobini siz yuborasiz`
      : `Sardor: <b>${esc(t.captain || '—')}</b>. Siz javob taklif qilasiz`;
  $('#zl-change').classList.toggle('hidden', v.pick !== 'choose');
  show('z-lobby');
}

// --- Savol: oʻqish va muhokama ---
function zpQuestion(v) {
  const input = $('#zq-input');
  if (zpQ !== v.qIndex || !zpShown('z-q')) {
    zpQ = v.qIndex;
    Translit.markRaw(v.raw, $('#zq-text'), $('#zq-ideas'), $('#zq-status'));
    $('#zq-text').textContent = v.q.text;
    $('#zq-img').classList.toggle('hidden', !v.q.image);
    if (v.q.image) $('#zq-img').src = v.q.image;
    input.value = '';
    $('#zq-ideas').innerHTML = '';
  }
  $('#zq-num').textContent = `${v.qIndex + 1}-savol / ${v.total}`;
  const thinking = v.state === 'think';
  const t = v.team;
  $('#zq-reading').classList.toggle('hidden', thinking);
  $('#zq-form').classList.toggle('hidden', !thinking);
  $('#zq-ideas-wrap').classList.toggle('hidden', !thinking || !v.ideas.length);

  $('#zq-label').innerHTML = t.isCaptain ? `${icon('star')} Jamoa javobi — siz sardorsiz` : `${icon('bulb')} Taklifingiz`;
  input.placeholder = t.isCaptain ? 'Yakuniy javob' : 'Javob variantingiz';
  $('#zq-send').innerHTML = t.isCaptain ? `${icon('send')} Yuborish` : `${icon('plus')} Taklif`;
  const st = $('#zq-status');
  st.className = 'zq-status';
  if (t.isCaptain) {
    if (v.answer) {
      st.classList.add('ok');
      st.innerHTML = `${icon('checkCircle')} Yuborildi: <b>${esc(v.answer)}</b><small>Vaqt tugaguncha oʻzgartirish mumkin</small>`;
    } else st.innerHTML = 'Jamoa bilan maslahatlashing va javobni yuboring';
  } else {
    st.innerHTML = (v.answer ? `${icon('checkCircle')} Sardor yubordi: <b>${esc(v.answer)}</b>` : `Sardor: <b>${esc(t.captain || '—')}</b>`)
      + (v.myIdea ? `<small>Sizning taklifingiz: ${esc(v.myIdea)}</small>` : '');
    if (v.answer) st.classList.add('ok');
  }

  $('#zq-ideas-title').textContent = t.isCaptain ? 'Jamoa takliflari — tanlash uchun bosing' : 'Jamoa takliflari';
  // Faqat yangi taklif "uchib kiradi", eskilari joyida turadi
  const seen = new Set([...document.querySelectorAll('#zq-ideas .zq-idea')].map(b => b.dataset.text));
  $('#zq-ideas').innerHTML = (v.ideas || []).map(i => `
    <button type="button" class="zq-idea ${v.answer && i.text.toLowerCase() === v.answer.toLowerCase() ? 'chosen' : ''}" data-text="${esc(i.text)}" ${seen.has(i.text) ? 'style="animation:none"' : ''}>
      <b>${esc(i.text)}</b><small>${i.names.map(esc).join(', ')}</small>
    </button>`).join('');
  show('z-q');
  if (thinking) zpRunTimer(v);
  else {
    $('#zq-timer').textContent = v.q.time;
    $('#zq-timer-wrap').classList.remove('low');
  }
}

function zpRunTimer(v) {
  const endsAt = Date.now() + v.timer.endsIn;
  const locksAt = Date.now() + v.timer.locksIn;
  clearInterval(zpInt);
  const tick = () => {
    const ms = endsAt - Date.now();
    const wrap = $('#zq-timer-wrap');
    if (ms > 0) {
      const left = Math.ceil(ms / 1000);
      $('#zq-timer').textContent = left;
      wrap.classList.toggle('low', left <= 10);
      return;
    }
    const extra = Math.max(0, Math.ceil((locksAt - Date.now()) / 1000));
    $('#zq-timer').textContent = `+${extra}`;
    wrap.classList.add('low');
    if (zpOnce(`end:${v.qIndex}`) && navigator.vibrate) navigator.vibrate([200, 100, 200]);
    if (zp.team?.isCaptain && !zp.answer) {
      const st = $('#zq-status');
      st.className = 'zq-status warn';
      st.innerHTML = `${icon('clock')} Vaqt tugadi! ${extra} soniyada javobni yuboring`;
    }
    if (extra <= 0) clearInterval(zpInt);
  };
  tick();
  zpInt = setInterval(tick, 250);
}

$('#zq-form').addEventListener('submit', e => {
  e.preventDefault();
  const text = $('#zq-input').value.trim();
  if (!zp || !zp.team) return;
  if (!zp.team.isCaptain) {
    socket.emit('zk:idea', text);
    if (text) toast('Taklifingiz jamoaga koʻrsatildi', 1600);
    return;
  }
  if (!text) return toast('Avval javobni yozing');
  socket.emit('zk:answer', text, res => {
    if (res && res.error) return toast(res.error);
    if (navigator.vibrate) navigator.vibrate(30);
  });
});

// Taklifni bosish — matn javob maydoniga tushadi
$('#zq-ideas').addEventListener('click', e => {
  const b = e.target.closest('.zq-idea');
  if (!b) return;
  const input = $('#zq-input');
  input.value = b.dataset.text;
  input.focus();
});

// --- Baholanmoqda ---
function zpWait(v) {
  Translit.markRaw(v.raw, $('#zw-answer'));
  $('#zw-answer').innerHTML = v.answer ? `Jamoangiz javobi: <b>${esc(v.answer)}</b>` : 'Jamoangiz javob yubormadi';
  show('z-wait');
}

// --- Natija ---
function zpResult(v) {
  const r = v.result;
  const t = v.team;
  const box = $('#z-result');
  box.className = `screen ${zpShown('z-result') ? '' : 'hidden'} ${r.ok ? 'good' : 'bad'}`;
  $('#zr-icon').innerHTML = icon(r.ok ? 'checkCircle' : r.answer ? 'xCircle' : 'clock');
  $('#zr-title').textContent = r.ok ? 'Toʻgʻri! +1 ball' : r.answer ? 'Notoʻgʻri' : 'Javob berilmadi';
  Translit.markRaw(v.raw, $('#zr-team-answer'), $('#zr-correct'), $('#zr-comment'));
  $('#zr-team-answer').innerHTML = r.answer ? `Jamoangiz javobi: <b>${esc(r.answer)}</b>` : '';
  $('#zr-correct').innerHTML = `${icon('bulb')} Toʻgʻri javob: <b>${esc(r.correct)}</b>`;
  $('#zr-comment').classList.toggle('hidden', !r.comment);
  $('#zr-comment').textContent = r.comment;
  $('#zr-rank').innerHTML = t.rank === 1
    ? `${icon('trophy')} ${esc(t.name)} — birinchi oʻrinda!`
    : `${esc(t.name)} — ${t.rank}-oʻrin (${t.teams} ta jamoadan)`;
  $('#zr-score').textContent = `${t.score} ball`;
  if (zpOnce(`result:${v.qIndex}`)) {
    r.ok ? Sound.good() : Sound.bad();
    if (navigator.vibrate) navigator.vibrate(r.ok ? [40, 40, 40] : 200);
    $('#zr-icon').classList.toggle('shake', !r.ok);
  }
  show('z-result');
}

// --- Yakun ---
function zpEnd(v) {
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
    $('#ze-score').innerHTML = `${icon('star')} ${t.score} ball · ${v.played} ta savoldan`;
    if (zpOnce('end') && t.rank <= 3) {
      Sound.fanfare();
      setTimeout(() => confetti(), 300);
    }
  }
  saveSession(null);
  show('z-end');
}
