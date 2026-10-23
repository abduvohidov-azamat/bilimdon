// Oʻz oʻyini (Своя игра / Jeopardy) — maktab varianti.
// Doskada mavzular (qatorlar) va qiymatlar (100–500). Jamoalar navbat bilan javob beradi:
// toʻgʻri — +qiymat, notoʻgʻri — −qiymat va savol keyingi jamoaga oʻtadi.
// Maxsus katakchalar: "Mushuk qopda" (savol boshqa jamoaga beriladi, xavfsiz) va "Omad" (savolsiz ball).
// state: lobby → board → (question | cat → question | luck) → reveal → board … → ended
// Kutish zali, jamoalar va ulanish — teamgame.js da.

const playable = c => c.special === 'luck' || !!c.text;

const order = (g, fromId) => {
  const i = g.teams.findIndex(t => t.id === fromId);
  return [...g.teams.slice(i + 1), ...g.teams.slice(0, i + 1)];
};
const teamById = (g, id) => g.teams.find(t => t.id === id);
const cellOf = (g, ti, ci) => g.quiz.topics[ti]?.cells[ci];
const left = g => g.board.flat().filter(c => !c.played && !c.empty).length;

function finish(g, ctx) {
  g.state = 'reveal';
  g.log.push({ topic: g.quiz.topics[g.cur.ti].name, value: g.cur.value, special: g.cur.special, results: g.cur.results.map(r => ({ ...r })) });
  ctx.syncAll(g);
}

function curView(g, withAnswer) {
  const c = g.cur;
  if (!c) return null;
  const cell = cellOf(g, c.ti, c.ci);
  const v = {
    ti: c.ti, ci: c.ci, topic: g.quiz.topics[c.ti].name, value: c.value, special: c.special, cat: c.cat,
    text: cell.text, image: cell.image, answering: c.answering, tried: c.tried, results: c.results,
    time: g.opts.time, endsIn: c.endsAt ? c.endsAt - Date.now() : null,
  };
  if (withAnswer || g.state === 'reveal') Object.assign(v, { answer: cell.answer, comment: cell.comment });
  return v;
}

const rules = {
  captains: false,
  score: (g, t) => t.score,

  setup(g, opts) {
    g.opts = {
      time: [15, 30, 60].includes(+opts.time) ? +opts.time : 30,
      passOn: opts.passOn !== false, // notoʻgʻri javobdan keyin savol keyingi jamoaga oʻtadi
      penaltyAll: opts.penaltyAll !== false, // savol oʻtgan jamoa ham xato qilsa ball yoʻqotadi
      turnOrder: opts.turnOrder === 'winner' ? 'winner' : 'order', // navbat: tartib boʻyicha yoki toʻgʻri javob bergan jamoaga
    };
    g.board = g.quiz.topics.map(t => t.cells.map(c => ({ played: false, empty: !playable(c) })));
    g.turnId = null;
    g.cur = null;
    g.log = [];
    for (const t of g.teams) t.score = 0;
  },

  start(g, ctx) {
    g.turnId = g.teams[0].id;
    g.state = 'board';
    ctx.syncAll(g);
  },

  hostView(g) {
    return {
      values: g.quiz.values,
      topics: g.quiz.topics.map(t => t.name),
      grid: g.board,
      turnId: g.turnId,
      opts: g.opts,
      left: left(g),
      cur: curView(g, true),
      log: g.log,
    };
  },

  playerView(g, p, t) {
    const v = { turnId: g.turnId, turnName: teamById(g, g.turnId)?.name || '', myTurn: !!t && t.id === g.turnId, left: left(g) };
    if (['question', 'cat', 'luck', 'reveal'].includes(g.state)) {
      v.cur = curView(g, false);
      v.cur.answeringName = teamById(g, g.cur.answering)?.name || '';
      v.cur.results = g.cur.results.map(r => ({ ...r, name: teamById(g, r.team)?.name, color: teamById(g, r.team)?.color }));
    }
    return v;
  },

  hostEvents: {
    // Katakchani ochish
    'zk:open': (g, { t: ti, c: ci } = {}, ack, ctx) => {
      const cell = cellOf(g, ti, ci);
      const st = g.board[ti]?.[ci];
      if (g.state !== 'board' || !cell || !st || st.played || st.empty) return;
      st.played = true;
      const value = g.quiz.values[ci];
      g.cur = { ti, ci, value, special: cell.special || '', cat: false, answering: null, tried: [], results: [], endsAt: null };
      if (cell.special === 'luck') {
        // Omad: savolsiz ball navbatdagi jamoaga
        teamById(g, g.turnId).score += value;
        g.cur.results.push({ team: g.turnId, delta: value });
        g.state = 'luck';
        g.log.push({ topic: g.quiz.topics[ti].name, value, special: 'luck', results: [{ team: g.turnId, delta: value }] });
      } else if (cell.special === 'cat') {
        g.state = 'cat';
      } else {
        g.cur.answering = g.turnId;
        g.cur.endsAt = Date.now() + g.opts.time * 1000;
        g.state = 'question';
      }
      ctx.syncAll(g);
    },

    // Mushuk qopda: savolni boshqa jamoaga berish
    'zk:cat': (g, teamId, ack, ctx) => {
      if (g.state !== 'cat' || teamId === g.turnId || !teamById(g, teamId)) return;
      Object.assign(g.cur, { cat: true, answering: teamId, endsAt: Date.now() + g.opts.time * 1000 });
      g.state = 'question';
      ctx.syncAll(g);
    },

    'zk:verdict': (g, { ok } = {}, ack, ctx) => {
      if (g.state !== 'question') return;
      const c = g.cur;
      const t = teamById(g, c.answering);
      if (ok) {
        t.score += c.value;
        c.results.push({ team: t.id, delta: c.value });
        c.winner = t.id;
        return finish(g, ctx);
      }
      // Mushuk qopda — xavfsiz; birinchi jamoa doim, keyingilar sozlamaga koʻra ball yoʻqotadi
      const penalty = c.cat ? 0 : c.tried.length === 0 || g.opts.penaltyAll ? c.value : 0;
      t.score -= penalty;
      c.results.push({ team: t.id, delta: -penalty });
      c.tried.push(t.id);
      const next = !c.cat && g.opts.passOn && order(g, t.id).find(x => !c.tried.includes(x.id));
      if (!next) return finish(g, ctx);
      c.answering = next.id;
      c.endsAt = Date.now() + g.opts.time * 1000;
      ctx.syncAll(g);
    },

    // Hech kim javob bermadi — savol yopiladi
    'zk:nobody': (g, data, ack, ctx) => g.state === 'question' && finish(g, ctx),

    'zk:next': (g, data, ack, ctx) => {
      if (g.state !== 'reveal' && g.state !== 'luck') return;
      const winner = g.cur.winner;
      g.turnId = g.opts.turnOrder === 'winner' && winner != null ? winner : order(g, g.turnId)[0].id;
      g.cur = null;
      if (!left(g)) return ctx.endGame(g);
      g.state = 'board';
      ctx.syncAll(g);
    },
  },

  playerEvents: {},

  csv(g, ctx) {
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const name = id => teamById(g, id)?.name || '';
    const lines = [['Oʻrin', 'Jamoa', 'Aʼzolar', 'Ball']];
    for (const r of ctx.standings(g)) lines.push([r.rank, r.name, r.members.join('; '), r.score]);
    lines.push([], ['#', 'Mavzu', 'Qiymat', 'Natija']);
    g.log.forEach((e, i) => {
      const res = e.results.map(r => `${name(r.team)} ${r.delta > 0 ? '+' : r.delta < 0 ? '−' : '±'}${Math.abs(r.delta)}`).join('; ');
      const tag = e.special === 'luck' ? 'Omad: ' : e.special === 'cat' ? 'Mushuk qopda: ' : '';
      lines.push([i + 1, e.topic, e.value, tag + (res || 'Hech kim javob bermadi')]);
    });
    return '﻿' + lines.map(r => r.map(esc).join(',')).join('\r\n');
  },
};

module.exports = { rules };
