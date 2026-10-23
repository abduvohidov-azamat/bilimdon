// Jamoaviy oʻyinlar uchun umumiy asos (Zakovat, Oʻz oʻyini …): kutish zali, jamoalar, sardor,
// qayta ulanish, oʻqituvchi pulti. Har bir oʻyin turi oʻz qoidalarini "rules" obyekti sifatida beradi:
//   setup(g, opts)               — oʻyinga xos maydonlar
//   score(g, t)                  — jamoa bali
//   start(g, ctx)                — "Boshlash" bosilganda (jamoalar aniq)
//   hostView(g, ctx)             — boshlovchi ekrani uchun qoʻshimcha maʼlumot
//   playerView(g, p, t, ctx)     — oʻquvchi telefoni uchun qoʻshimcha maʼlumot
//   hostEvents / playerEvents    — { 'zk:…': handler } oʻyinga xos hodisalar
//   csv(g, ctx)                  — natijalar fayli
//   captains                     — sardor tushunchasi bormi (Zakovat — ha)
const crypto = require('crypto');

const TEAM_NAMES = ['Lochinlar', 'Burgutlar', 'Qoplonlar', 'Arslonlar', 'Zukkolar', 'Bilagʻonlar', 'Yulduzlar', 'Shunqorlar'];
const MAX_PLAYERS = 200;

module.exports = function createTeamGames({ io, games, makePin, newId, cleanPlayerName, kinds }) {
  const rulesOf = g => kinds[g.kind];
  const live = g => [...g.players.values()].filter(p => !p.kicked);
  const members = (g, t) => live(g).filter(p => p.team === t.id);
  const teamOf = (g, p) => (p.team == null ? null : g.teams.find(t => t.id === p.team) || null);
  const raw = g => g.quiz.lang === 'other';
  const pub = p => ({ id: p.id, name: p.name, connected: p.connected });

  // Sardor ulanmagan boʻlsa — jamoaning ulangan boshqa aʼzosi sardor boʻladi
  function ensureCaptain(g, t) {
    const m = members(g, t);
    const cap = m.find(p => p.id === t.captainId);
    if (cap && cap.connected) return;
    const next = m.find(p => p.connected) || cap || m[0];
    t.captainId = next ? next.id : null;
  }

  function smallestTeam(g) {
    return g.teams.reduce((best, t) => (members(g, t).length < members(g, best).length ? t : best), g.teams[0]);
  }

  // Bir xil ball — bir xil oʻrin (1, 1, 3 …)
  function standings(g) {
    const rows = g.teams
      .map(t => ({ id: t.id, name: t.name, color: t.color, score: rulesOf(g).score(g, t), members: members(g, t).map(p => p.name) }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    rows.forEach((r, i) => (r.rank = i > 0 && rows[i - 1].score === r.score ? rows[i - 1].rank : i + 1));
    return rows;
  }

  function hostView(g) {
    const rules = rulesOf(g);
    return {
      kind: g.kind, captains: !!rules.captains,
      pin: g.pin, title: g.quiz.title, raw: raw(g), state: g.state, pick: g.pick, locked: g.locked, remoteToken: g.remoteToken,
      teams: g.teams.map(t => ({ id: t.id, name: t.name, color: t.color, captainId: t.captainId, score: rules.score(g, t), members: members(g, t).map(pub) })),
      unassigned: live(g).filter(p => p.team == null).map(pub),
      ...rules.hostView(g, ctx),
    };
  }

  function playerView(g, p) {
    const rules = rulesOf(g);
    const t = teamOf(g, p);
    const v = { kind: g.kind, captains: !!rules.captains, state: g.state, title: g.quiz.title, raw: raw(g), name: p.name, pick: g.pick };
    if (t) {
      const ranks = standings(g);
      const me = ranks.find(r => r.id === t.id);
      v.team = {
        id: t.id, name: t.name, color: t.color, isCaptain: !!rules.captains && t.captainId === p.id,
        captain: rules.captains ? g.players.get(t.captainId)?.name || null : null,
        members: members(g, t).map(m => m.name),
        score: me.score, rank: me.rank, teams: ranks.length,
      };
    }
    if (g.pick === 'choose' && (g.state === 'lobby' || !t)) {
      v.choices = g.teams.map(x => ({ id: x.id, name: x.name, color: x.color, count: members(g, x).length }));
    }
    return { ...v, ...rules.playerView(g, p, t, ctx) };
  }

  // Boshlovchi ekrani va oʻqituvchi pulti(lar)i bir xil holatni oladi
  function syncHost(g) {
    const v = hostView(g);
    if (g.hostSocketId) io.to(g.hostSocketId).emit('zk:state', v);
    for (const id of g.remotes) io.to(id).emit('zk:state', v);
  }
  const syncPlayer = (g, p) => p.socketId && io.to(p.socketId).emit('zk:p', playerView(g, p));
  function syncAll(g) {
    syncHost(g);
    for (const p of live(g)) syncPlayer(g, p);
  }
  function syncTeam(g, t) {
    syncHost(g);
    for (const p of members(g, t)) syncPlayer(g, p);
  }

  function clearTimer(g) {
    if (g.timer) clearTimeout(g.timer);
    g.timer = null;
  }

  function endGame(g) {
    clearTimer(g);
    g.state = 'ended';
    syncAll(g);
    setTimeout(() => games.delete(g.pin), 60 * 60 * 1000);
  }

  const ctx = { live, members, teamOf, standings, ensureCaptain, syncAll, syncHost, syncTeam, syncPlayer, clearTimer, endGame };

  // ---------- Oʻyin yaratish va ulanish (server.js chaqiradi) ----------

  function create(socket, user, quiz, opts, ack) {
    const count = Math.min(8, Math.max(2, Number.parseInt(opts.teams, 10) || 4));
    const g = {
      teamGame: true,
      kind: quiz.mode,
      pin: makePin(),
      hostToken: crypto.randomBytes(16).toString('hex'),
      remoteToken: crypto.randomBytes(8).toString('hex'),
      hostSocketId: socket.id,
      remotes: new Set(),
      ownerId: user.id,
      quiz: JSON.parse(JSON.stringify(quiz)),
      state: 'lobby',
      players: new Map(),
      teams: TEAM_NAMES.slice(0, count).map((name, i) => ({ id: i, name, color: i, captainId: null })),
      pick: opts.pick === 'choose' ? 'choose' : 'auto',
      locked: false,
      timer: null,
    };
    rulesOf(g).setup(g, opts);
    games.set(g.pin, g);
    socket.data.hostPin = g.pin;
    ack({ pin: g.pin, hostToken: g.hostToken, title: quiz.title, raw: raw(g), zk: true, kind: g.kind });
    syncHost(g);
  }

  function hostRejoin(g, socket, ack) {
    g.hostSocketId = socket.id;
    socket.data.hostPin = g.pin;
    ack({ ok: true, zk: true, kind: g.kind, state: g.state });
    syncHost(g);
  }

  function join(g, socket, { name, playerId }, ack) {
    const existing = playerId && g.players.get(playerId);
    if (existing) {
      if (existing.kicked) return ack({ error: 'Siz oʻyindan chiqarilgansiz' });
      existing.socketId = socket.id;
      existing.connected = true;
      socket.data.player = { pin: g.pin, id: existing.id };
      socket.join(`players:${g.pin}`);
      const t = teamOf(g, existing);
      if (t) ensureCaptain(g, t);
      ack({ ok: true, playerId: existing.id, name: existing.name });
      return t ? syncTeam(g, t) : (syncHost(g), syncPlayer(g, existing));
    }

    // Kech qolganlar ham qoʻshila oladi (dars boshlanib ketgan boʻlsa ham)
    if (g.state === 'ended') return ack({ error: 'Oʻyin tugagan' });
    if (g.locked) return ack({ error: 'Oʻyin qulflangan' });
    const checked = cleanPlayerName(g, name);
    if (checked.error) return ack(checked);
    if (g.players.size >= MAX_PLAYERS) return ack({ error: 'Oʻyin toʻla' });

    const p = { id: newId(), name: checked.name, team: null, socketId: socket.id, connected: true, kicked: false };
    if (g.pick === 'auto') p.team = smallestTeam(g).id;
    g.players.set(p.id, p);
    socket.data.player = { pin: g.pin, id: p.id };
    socket.join(`players:${g.pin}`);
    const t = teamOf(g, p);
    if (t) ensureCaptain(g, t);
    ack({ ok: true, playerId: p.id, name: p.name });
    syncAll(g);
  }

  function disconnect(g, p) {
    p.connected = false;
    p.socketId = null;
    const t = teamOf(g, p);
    if (t) {
      ensureCaptain(g, t);
      syncTeam(g, t);
    } else syncHost(g);
  }

  // ---------- Socket hodisalari ----------

  // Oʻyin turlariga xos hodisalar nomlari (bir nom bir necha turda boʻlishi mumkin — oʻyin turiga qarab yoʻnaltiriladi)
  const hostEventNames = new Set(Object.values(kinds).flatMap(r => Object.keys(r.hostEvents || {})));
  const playerEventNames = new Set(Object.values(kinds).flatMap(r => Object.keys(r.playerEvents || {})));

  function register(socket) {
    // Boshlovchi ekrani yoki oʻqituvchi pulti
    const hostGame = () => {
      const g = games.get(socket.data.hostPin || socket.data.remotePin);
      return g && g.teamGame && (g.hostSocketId === socket.id || g.remotes.has(socket.id)) ? g : null;
    };
    const me = () => {
      const ref = socket.data.player;
      const g = ref && games.get(ref.pin);
      const p = g && g.teamGame && g.players.get(ref.id);
      return p && !p.kicked ? { g, p } : {};
    };

    for (const ev of hostEventNames) {
      socket.on(ev, (data, ack) => {
        const g = hostGame();
        const fn = g && rulesOf(g).hostEvents?.[ev];
        if (fn) fn(g, data, typeof ack === 'function' ? ack : () => {}, ctx);
      });
    }
    for (const ev of playerEventNames) {
      socket.on(ev, (data, ack) => {
        const { g, p } = me();
        const reply = typeof ack === 'function' ? ack : () => {};
        const fn = g && rulesOf(g).playerEvents?.[ev];
        if (!fn) return reply({ error: 'Oʻyin topilmadi' });
        fn(g, p, data, reply, ctx);
      });
    }

    // --- Oʻqituvchi pulti (telefon): QR-kod orqali ulanadi, javoblarni koʻradi va oʻyinni boshqaradi ---
    socket.on('zk:remote', ({ pin, token } = {}, ack) => {
      const g = games.get(String(pin || ''));
      if (!g || !g.teamGame || token !== g.remoteToken) return ack && ack({ error: 'Pult havolasi notoʻgʻri yoki oʻyin tugagan' });
      g.remotes.add(socket.id);
      socket.data.remotePin = g.pin;
      ack && ack({ ok: true });
      io.to(socket.id).emit('zk:state', hostView(g));
    });
    socket.on('disconnect', () => {
      const g = socket.data.remotePin && games.get(socket.data.remotePin);
      if (g && g.remotes) g.remotes.delete(socket.id);
    });

    // --- Kutish zali (barcha jamoaviy oʻyinlar uchun bir xil) ---
    socket.on('zk:start', () => {
      const g = hostGame();
      if (!g || g.state !== 'lobby' || !live(g).length) return;
      for (const p of live(g)) if (p.team == null) p.team = smallestTeam(g).id;
      // Boʻsh jamoalar oʻyinda qatnashmaydi
      g.teams = g.teams.filter(t => members(g, t).length);
      g.teams.forEach(t => ensureCaptain(g, t));
      rulesOf(g).start(g, ctx);
    });

    socket.on('zk:end', () => {
      const g = hostGame();
      if (g && g.state !== 'ended') endGame(g);
    });

    socket.on('zk:lock', locked => {
      const g = hostGame();
      if (g) g.locked = !!locked;
    });

    socket.on('zk:captain', playerId => {
      const g = hostGame();
      const p = g && g.players.get(playerId);
      const t = p && !p.kicked && teamOf(g, p);
      if (!t) return;
      t.captainId = p.id;
      syncTeam(g, t);
    });

    socket.on('zk:kick', playerId => {
      const g = hostGame();
      const p = g && g.players.get(playerId);
      if (!p || p.kicked) return;
      p.kicked = true;
      if (p.socketId) {
        io.to(p.socketId).emit('kicked');
        io.sockets.sockets.get(p.socketId)?.leave(`players:${g.pin}`);
      }
      const t = teamOf(g, p);
      if (t) ensureCaptain(g, t);
      syncAll(g);
    });

    socket.on('zk:pick', (teamId, ack) => {
      const { g, p } = me();
      const t = g && g.teams.find(x => x.id === teamId);
      if (!t || g.pick !== 'choose' || (g.state !== 'lobby' && p.team != null)) return ack && ack({ error: 'Jamoani tanlab boʻlmadi' });
      const old = teamOf(g, p);
      p.team = t.id;
      if (old) {
        if (old.captainId === p.id) old.captainId = null;
        ensureCaptain(g, old);
      }
      ensureCaptain(g, t);
      ack && ack({ ok: true });
      syncAll(g);
    });
  }

  const csv = g => rulesOf(g).csv(g, ctx);

  return { create, hostRejoin, join, disconnect, register, csv };
};
