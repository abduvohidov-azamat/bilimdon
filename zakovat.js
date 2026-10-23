// Zakovat rejimi: oʻquvchilar jamoalarga boʻlinadi, savolni birga muhokama qiladi,
// sardor yozma javob yuboradi, boshlovchi (oʻqituvchi) javoblarni baholaydi. Toʻgʻri javob — 1 ball.
// state: lobby → read → think → judge → reveal → table → (read …) → ended
// Kutish zali, jamoalar va ulanish — teamgame.js da.
const { toLat } = require('./public/translit');

const EXTRA_MS = 10000; // vaqt tugagach javobni yozib yuborish uchun 10 soniya (haqiqiy Zakovatdagidek)
const MAX_ANSWER = 80;

// ---------- Javoblarni solishtirish ----------

// Kirill → lotin, kichik harf, tutuq belgisi va tinish belgilarisiz: «Нефть» = "neft", "Ulugʻbek" = "ulugbek"
function answerKey(s) {
  return toLat(String(s || ''))
    .toLowerCase()
    .replace(/[ʻʼ'‘’`´]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

// Tahrir masofasi; yonma-yon harflar oʻrni almashsa ("toshknet") — bitta xato
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

// Kichik imlo xatosi: 5–9 harfli soʻzda 1 ta, uzunroqda 2 ta harf farqi
function closeEnough(right, given) {
  const limit = right.length >= 10 ? 2 : right.length >= 5 ? 1 : 0;
  return limit > 0 && Math.abs(right.length - given.length) <= limit && editDistance(right, given) <= limit;
}

// { ok, how } — avtomatik baho; null — boshlovchi oʻzi hal qiladi
function autoVerdict(q, key) {
  if (q.reject.some(r => answerKey(r) === key)) return { ok: false, how: 'reject' };
  const right = [q.answer, ...q.accept].map(answerKey).filter(Boolean);
  if (right.includes(key)) return { ok: true, how: 'exact' };
  if (right.some(r => closeEnough(r, key))) return { ok: true, how: 'fuzzy' };
  return null;
}

// ---------- Oʻyin qoidalari ----------

const currentQ = g => g.quiz.questions[g.qIndex];
const score = (g, t) => t.marks.filter(Boolean).length;

function tableView(g, ctx) {
  const counts = Array.from({ length: g.played }, (_, i) => g.teams.filter(t => t.marks[i]).length);
  const rows = ctx.standings(g).map(r => ({ ...r, marks: g.teams.find(t => t.id === r.id).marks.slice(0, g.played) }));
  return { rows, counts };
}

function startRead(g, ctx) {
  g.state = 'read';
  g.cur = { answers: new Map(), ideas: new Map(), groups: [] };
  ctx.syncAll(g);
}

function startThink(g, ctx) {
  const q = currentQ(g);
  g.state = 'think';
  g.cur.endsAt = Date.now() + q.time * 1000;
  g.cur.locksAt = g.cur.endsAt + EXTRA_MS;
  ctx.clearTimer(g);
  g.timer = setTimeout(() => lock(g, ctx), q.time * 1000 + EXTRA_MS + 300);
  ctx.syncAll(g);
}

// Javoblar qabul qilinmaydi; bir xil javoblar guruhlanadi va iloji boricha avtomatik baholanadi
function lock(g, ctx) {
  if (g.state !== 'think') return;
  ctx.clearTimer(g);
  g.state = 'judge';
  const q = currentQ(g);
  const byKey = new Map();
  for (const t of g.teams) {
    const a = g.cur.answers.get(t.id);
    const key = a && answerKey(a.text);
    if (!key) continue;
    if (!byKey.has(key)) {
      const auto = autoVerdict(q, key);
      byKey.set(key, { key, text: a.text, teams: [], ok: auto ? auto.ok : null, how: auto ? auto.how : null });
    }
    byKey.get(key).teams.push(t.id);
  }
  // Avval baholanmaganlar — boshlovchi ular bilan ishlaydi
  const order = gr => (gr.ok === null ? 0 : gr.ok ? 1 : 2);
  g.cur.groups = [...byKey.values()].sort((a, b) => order(a) - order(b));
  ctx.syncAll(g);
}

function confirm(g, ctx) {
  if (g.state !== 'judge' || g.cur.groups.some(gr => gr.ok === null)) return;
  const verdicts = new Map(g.cur.groups.map(gr => [gr.key, gr.ok]));
  for (const t of g.teams) {
    const a = g.cur.answers.get(t.id);
    t.answers[g.qIndex] = a ? a.text : '';
    t.marks[g.qIndex] = !!(a && verdicts.get(answerKey(a.text)));
  }
  g.verdicts[g.qIndex] = verdicts;
  // Sardor yuborgan javob ham uning taklifi hisoblanadi
  const ideas = new Map(g.cur.ideas);
  for (const a of g.cur.answers.values()) if (!ideas.has(a.by)) ideas.set(a.by, a.text);
  g.ideas[g.qIndex] = ideas;
  g.played = g.qIndex + 1;
  g.state = 'reveal';
  ctx.syncAll(g);
}

const clean = text => String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_ANSWER);

const rules = {
  captains: true,
  score,

  setup(g) {
    g.qIndex = -1;
    g.played = 0;
    g.cur = null;
    g.verdicts = [];
    g.ideas = [];
    for (const t of g.teams) Object.assign(t, { marks: [], answers: [] });
  },

  start(g, ctx) {
    g.qIndex = 0;
    startRead(g, ctx);
  },

  hostView(g, ctx) {
    const v = { qIndex: g.qIndex, total: g.quiz.questions.length, played: g.played, table: tableView(g, ctx) };
    if (g.qIndex >= 0 && g.state !== 'ended') {
      const q = currentQ(g);
      v.q = { text: q.text, image: q.image, time: q.time, answer: q.answer, accept: q.accept, comment: q.comment, source: q.source };
    }
    if (g.state === 'think') {
      v.timer = { endsIn: g.cur.endsAt - Date.now(), locksIn: g.cur.locksAt - Date.now() };
      v.submitted = [...g.cur.answers.keys()];
    }
    if (g.state === 'judge' || g.state === 'reveal') {
      v.groups = g.cur.groups;
      v.missing = g.teams.filter(t => !g.cur.groups.some(gr => gr.teams.includes(t.id))).map(t => t.id);
    }
    return v;
  },

  playerView(g, p, t, ctx) {
    const v = { qIndex: g.qIndex, total: g.quiz.questions.length, played: g.played };
    if (['read', 'think', 'judge', 'reveal', 'table'].includes(g.state)) {
      const q = currentQ(g);
      v.q = { text: q.text, image: q.image, time: q.time };
    }
    if (g.state === 'think') v.timer = { endsIn: g.cur.endsAt - Date.now(), locksIn: g.cur.locksAt - Date.now() };
    if (t && (g.state === 'think' || g.state === 'judge')) {
      const ideas = new Map();
      for (const m of ctx.members(g, t)) {
        const text = g.cur.ideas.get(m.id);
        if (!text) continue;
        const key = answerKey(text);
        if (!ideas.has(key)) ideas.set(key, { text, names: [] });
        ideas.get(key).names.push(m.name);
      }
      v.ideas = [...ideas.values()].sort((a, b) => b.names.length - a.names.length);
      v.myIdea = g.cur.ideas.get(p.id) || '';
      v.answer = g.cur.answers.get(t.id)?.text || null;
    }
    if (t && (g.state === 'reveal' || g.state === 'table')) {
      const q = currentQ(g);
      v.result = { ok: !!t.marks[g.qIndex], answer: t.answers[g.qIndex] || '', correct: q.answer, accept: q.accept, comment: q.comment };
    }
    return v;
  },

  hostEvents: {
    'zk:go': (g, data, ack, ctx) => g.state === 'read' && startThink(g, ctx),
    'zk:skip': (g, data, ack, ctx) => lock(g, ctx),
    'zk:judge': (g, { key, ok } = {}, ack, ctx) => {
      const gr = g.state === 'judge' && g.cur.groups.find(x => x.key === key);
      if (!gr) return;
      gr.ok = !!ok;
      gr.how = 'host';
      ctx.syncHost(g);
    },
    'zk:confirm': (g, data, ack, ctx) => confirm(g, ctx),
    'zk:next': (g, data, ack, ctx) => {
      if (g.state === 'reveal') {
        g.state = 'table';
        ctx.syncAll(g);
      } else if (g.state === 'table') {
        if (g.qIndex >= g.quiz.questions.length - 1) return ctx.endGame(g);
        g.qIndex++;
        startRead(g, ctx);
      }
    },
    // Apellyatsiya: jadvaldagi natijani qoʻlda oʻzgartirish
    'zk:fix': (g, { teamId, q } = {}, ack, ctx) => {
      const t = g.teams.find(x => x.id === teamId);
      if (!t || !['reveal', 'table', 'ended'].includes(g.state) || !Number.isInteger(q) || q < 0 || q >= g.played) return;
      t.marks[q] = !t.marks[q];
      ctx.syncAll(g);
    },
  },

  playerEvents: {
    // Jamoadoshning taklifi — faqat oʻz jamoasiga koʻrinadi
    'zk:idea': (g, p, text, ack, ctx) => {
      const t = ctx.teamOf(g, p);
      if (!t || g.state !== 'think') return;
      const c = clean(text);
      c ? g.cur.ideas.set(p.id, c) : g.cur.ideas.delete(p.id);
      ctx.syncTeam(g, t);
    },
    // Sardorning yakuniy javobi (vaqt tugaguncha oʻzgartirish mumkin)
    'zk:answer': (g, p, text, ack, ctx) => {
      const t = ctx.teamOf(g, p);
      if (!t || g.state !== 'think' || Date.now() > g.cur.locksAt) return ack({ error: 'Vaqt tugadi' });
      ctx.ensureCaptain(g, t);
      if (t.captainId !== p.id) return ack({ error: 'Javobni faqat sardor yuboradi' });
      const c = clean(text);
      if (!c) return ack({ error: 'Javob boʻsh' });
      g.cur.answers.set(t.id, { text: c, by: p.id });
      ack({ ok: true });
      ctx.syncTeam(g, t);
      // Asosiy vaqt tugagan va hamma jamoa javob bergan boʻlsa — kutmasdan yakunlash
      const waiting = g.teams.filter(x => ctx.members(g, x).some(m => m.connected) && !g.cur.answers.has(x.id));
      if (Date.now() > g.cur.endsAt && !waiting.length) lock(g, ctx);
    },
  },

  // ---------- Natijalar (Excel/CSV) ----------
  csv(g, ctx) {
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const qs = g.quiz.questions.slice(0, g.played);
    const lines = [['Oʻrin', 'Jamoa', 'Aʼzolar', 'Ball', ...qs.map((_, i) => `${i + 1}-savol`)]];
    for (const r of ctx.standings(g)) {
      const t = g.teams.find(x => x.id === r.id);
      lines.push([r.rank, r.name, r.members.join('; '), r.score, ...qs.map((_, i) => `${t.marks[i] ? '+' : '−'} ${t.answers[i] || '(javob yoʻq)'}`)]);
    }
    lines.push([], ['Toʻgʻri javob', '', '', '', ...qs.map(q => q.answer)]);

    // Kim toʻgʻri javobni taklif qilgan — oʻqituvchi har bir oʻquvchining hissasini koʻradi
    lines.push([], ['Oʻquvchi', 'Jamoa', 'Toʻgʻri takliflar']);
    const ideaOk = (i, text) => {
      const key = answerKey(text);
      const v = g.verdicts[i]?.get(key);
      return v !== undefined ? v : autoVerdict(qs[i], key)?.ok === true;
    };
    for (const p of ctx.live(g)) {
      const good = qs.filter((_, i) => {
        const text = g.ideas[i]?.get(p.id);
        return text && ideaOk(i, text);
      }).length;
      lines.push([p.name, ctx.teamOf(g, p)?.name || '', `${good}/${qs.length}`]);
    }
    return '﻿' + lines.map(r => r.map(esc).join(',')).join('\r\n');
  },
};

module.exports = { rules, answerKey, autoVerdict };
