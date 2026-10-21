// Bilimdon — oʻzbekcha jonli viktorina serveri
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const GET_READY_MS = 3000;
const ANSWER_GRACE_MS = 1500; // tarmoq kechikishi uchun qoʻshimcha vaqt
const MAX_NAME = 16;
const COOKIE = 'bd_session';
const SESSION_DAYS = 30;
const TEAM_NAMES = ['Lochinlar', 'Burgutlar', 'Qoplonlar', 'Arslonlar'];

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);
const io = new Server(server);

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  next();
});
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));

// ---------- Maʼlumotlar (JSON fayllar) ----------

const FILES = {
  quizzes: path.join(DATA_DIR, 'quizzes.json'),
  users: path.join(DATA_DIR, 'users.json'),
  assignments: path.join(DATA_DIR, 'assignments.json'),
};

// Fayl yoʻq boʻlsa — boshlangʻich qiymat; buzilgan boʻlsa — xato (maʼlumotni ustidan yozib yubormaslik uchun)
function readJson(file, initial) {
  if (!fs.existsSync(file)) return initial();
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function writeJson(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  try {
    fs.renameSync(tmp, file);
  } catch {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    fs.rmSync(tmp, { force: true });
  }
}

let quizzes = readJson(FILES.quizzes, () => require('./seed'));
let users = readJson(FILES.users, () => []);
let assignments = readJson(FILES.assignments, () => []);
const save = {
  quizzes: () => writeJson(FILES.quizzes, quizzes),
  users: () => writeJson(FILES.users, users),
  assignments: () => writeJson(FILES.assignments, assignments),
};
if (!fs.existsSync(FILES.quizzes)) save.quizzes();

const newId = () => crypto.randomBytes(6).toString('hex');

// ---------- Hisoblar va sessiyalar ----------

const SECRET = process.env.SESSION_SECRET || (() => {
  const f = path.join(DATA_DIR, 'secret.key');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('hex'));
  return fs.readFileSync(f, 'utf8').trim();
})();

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
}
function checkPassword(password, user) {
  const h = crypto.scryptSync(password, user.salt, 64);
  return crypto.timingSafeEqual(h, Buffer.from(user.hash, 'hex'));
}

const hmac = s => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
function signSession(uid) {
  const body = `${uid}.${Date.now() + SESSION_DAYS * 864e5}`;
  return `${body}.${hmac(body)}`;
}
function verifySession(token) {
  const [uid, exp, sig] = String(token || '').split('.');
  if (!sig) return null;
  const expected = hmac(`${uid}.${exp}`);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (+exp < Date.now()) return null;
  return users.find(u => u.id === uid) || null;
}
function getCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}
const userFromCookie = header => verifySession(getCookie(header, COOKIE));

function auth(req, res, next) {
  req.user = userFromCookie(req.headers.cookie);
  if (!req.user) return res.status(401).json({ error: 'Iltimos, tizimga kiring' });
  next();
}
function setSession(req, res, user) {
  res.cookie(COOKIE, signSession(user.id), { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: SESSION_DAYS * 864e5 });
}
const publicUser = u => ({ id: u.id, name: u.name, login: u.login });

// Email yoki telefon raqam (+998 90 123 45 67 → +998901234567)
function normalizeLogin(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return s;
  const phone = s.replace(/[\s()-]/g, '');
  if (/^\+?\d{9,15}$/.test(phone)) return phone.startsWith('+') ? phone : phone.length === 9 ? '+998' + phone : '+' + phone;
  return null;
}

// Parolni taxmin qilishdan himoya: 15 daqiqada 10 ta xato urinish
const failedLogins = new Map();
function loginBlocked(ip) {
  const f = failedLogins.get(ip);
  return f && f.count >= 10 && f.until > Date.now();
}
function loginFailed(ip) {
  const f = failedLogins.get(ip);
  if (!f || f.until < Date.now()) failedLogins.set(ip, { count: 1, until: Date.now() + 15 * 60e3 });
  else f.count++;
}

app.post('/api/auth/register', (req, res) => {
  const name = String(req.body.name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const login = normalizeLogin(req.body.login);
  const password = String(req.body.password || '');
  if (name.length < 2) return res.status(400).json({ error: 'Ism-familiyangizni kiriting' });
  if (!login) return res.status(400).json({ error: 'Email yoki telefon raqam notoʻgʻri' });
  if (password.length < 6) return res.status(400).json({ error: 'Parol kamida 6 ta belgidan iborat boʻlsin' });
  if (users.some(u => u.login === login)) return res.status(400).json({ error: 'Bu login bilan allaqachon roʻyxatdan oʻtilgan' });
  const user = { id: newId(), name, login, ...hashPassword(password), createdAt: Date.now() };
  users.push(user);
  save.users();
  setSession(req, res, user);
  res.json(publicUser(user));
});

app.post('/api/auth/login', (req, res) => {
  if (loginBlocked(req.ip)) return res.status(429).json({ error: 'Juda koʻp urinish. 15 daqiqadan soʻng qayta urining' });
  const login = normalizeLogin(req.body.login);
  const user = login && users.find(u => u.login === login);
  if (!user || !checkPassword(String(req.body.password || ''), user)) {
    loginFailed(req.ip);
    return res.status(400).json({ error: 'Login yoki parol notoʻgʻri' });
  }
  failedLogins.delete(req.ip);
  setSession(req, res, user);
  res.json(publicUser(user));
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => res.json(publicUser(req.user)));

// ---------- Viktorinalar ----------

// Egasi yoʻq viktorinalar — hammaga koʻrinadigan namunalar
const canRead = (q, u) => !q.ownerId || q.ownerId === u.id;
const canEdit = (q, u) => q.ownerId === u.id;

function validateQuiz(q) {
  if (!q || typeof q.title !== 'string' || !q.title.trim()) return 'Viktorina nomi kiritilmagan';
  if (!Array.isArray(q.questions) || q.questions.length === 0) return 'Kamida bitta savol boʻlishi kerak';
  if (q.questions.length > 100) return 'Savollar soni 100 tadan oshmasin';
  for (const [i, s] of q.questions.entries()) {
    const n = i + 1;
    if (!s.text || !String(s.text).trim()) return `${n}-savol matni boʻsh`;
    if (!Array.isArray(s.options) || s.options.length < 2 || s.options.length > 4) return `${n}-savolda 2–4 ta javob boʻlishi kerak`;
    if (s.options.some(o => !String(o).trim())) return `${n}-savolda boʻsh javob bor`;
    if (!Array.isArray(s.correct) || s.correct.length === 0) return `${n}-savolda toʻgʻri javob belgilanmagan`;
    if (s.correct.some(c => !Number.isInteger(+c) || c < 0 || c >= s.options.length)) return `${n}-savolda notoʻgʻri javob indeksi`;
  }
  return null;
}

function cleanQuiz(q) {
  return {
    title: q.title.trim().slice(0, 120),
    description: String(q.description || '').trim().slice(0, 300),
    // 'uz' — lotin/kirill oʻgiriladi; 'other' — rus, ingliz va boshqa tillar (oʻgirilmaydi)
    lang: q.lang === 'other' ? 'other' : 'uz',
    questions: q.questions.map(s => ({
      type: s.type === 'truefalse' ? 'truefalse' : 'multiple',
      text: String(s.text).trim().slice(0, 300),
      image: String(s.image || '').trim().slice(0, 1000),
      options: s.options.map(o => String(o).trim().slice(0, 90)),
      correct: [...new Set(s.correct.map(Number))],
      time: [5, 10, 20, 30, 60, 90, 120].includes(+s.time) ? +s.time : 20,
      points: [0, 1, 2].includes(+s.points) ? +s.points : 1,
    })),
  };
}

app.get('/api/quizzes', auth, (req, res) => {
  const list = quizzes.filter(q => canRead(q, req.user));
  list.sort((a, b) => !!a.ownerId === !!b.ownerId ? b.updatedAt - a.updatedAt : a.ownerId ? -1 : 1);
  res.json(list.map(q => ({ id: q.id, title: q.title, description: q.description, count: q.questions.length, updatedAt: q.updatedAt, sample: !q.ownerId, lang: q.lang || 'uz' })));
});
app.get('/api/quizzes/:id', auth, (req, res) => {
  const q = quizzes.find(x => x.id === req.params.id);
  q && canRead(q, req.user) ? res.json({ ...q, sample: !q.ownerId }) : res.status(404).json({ error: 'Topilmadi' });
});
app.post('/api/quizzes', auth, (req, res) => {
  const err = validateQuiz(req.body);
  if (err) return res.status(400).json({ error: err });
  const q = { id: newId(), ownerId: req.user.id, ...cleanQuiz(req.body), updatedAt: Date.now() };
  quizzes.unshift(q);
  save.quizzes();
  res.json(q);
});
app.put('/api/quizzes/:id', auth, (req, res) => {
  const i = quizzes.findIndex(x => x.id === req.params.id);
  if (i < 0 || !canEdit(quizzes[i], req.user)) return res.status(404).json({ error: 'Topilmadi' });
  const err = validateQuiz(req.body);
  if (err) return res.status(400).json({ error: err });
  quizzes[i] = { id: quizzes[i].id, ownerId: req.user.id, ...cleanQuiz(req.body), updatedAt: Date.now() };
  save.quizzes();
  res.json(quizzes[i]);
});
app.delete('/api/quizzes/:id', auth, (req, res) => {
  const q = quizzes.find(x => x.id === req.params.id);
  if (!q || !canEdit(q, req.user)) return res.status(404).json({ error: 'Topilmadi' });
  quizzes = quizzes.filter(x => x !== q);
  save.quizzes();
  res.json({ ok: true });
});

// ---------- Rasm yuklash ----------

const IMG_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
function looksLikeImage(buf, ext) {
  const hex = buf.subarray(0, 4).toString('hex');
  if (ext === 'png') return hex === '89504e47';
  if (ext === 'jpg') return hex.startsWith('ffd8ff');
  if (ext === 'gif') return hex === '47494638';
  if (ext === 'webp') return buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP';
  return false;
}
app.post('/api/upload', auth, express.raw({ type: Object.keys(IMG_TYPES), limit: '5mb' }), (req, res) => {
  const ext = IMG_TYPES[String(req.headers['content-type']).split(';')[0]];
  if (!ext || !Buffer.isBuffer(req.body) || !looksLikeImage(req.body, ext)) {
    return res.status(400).json({ error: 'Faqat PNG, JPG, GIF yoki WEBP rasm yuklash mumkin' });
  }
  const name = `${newId()}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), req.body);
  res.json({ url: `/uploads/${name}` });
});

// ---------- Ulanish maʼlumotlari ----------

// Mahalliy tarmoq manzili — oʻquvchilar telefondan shu manzilga kiradi
function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254')) return a.address;
    }
  }
  return 'localhost';
}
function baseUrl(req) {
  if (req.hostname === 'localhost' || req.hostname === '127.0.0.1') return `http://${lanAddress()}:${PORT}`;
  return `${req.protocol}://${req.get('host')}`;
}
app.get('/api/info', (req, res) => res.json({ joinUrl: baseUrl(req) }));
app.get('/api/qr', async (req, res) => {
  try {
    const svg = await QRCode.toString(String(req.query.text || '').slice(0, 500), { type: 'svg', margin: 1 });
    res.type('image/svg+xml').send(svg);
  } catch {
    res.status(400).end();
  }
});

// ---------- Ball hisoblash (jonli oʻyin va uy vazifasi uchun bir xil) ----------

// Kahoot formulasi: tez javob — koʻproq ball (500–1000), ustiga ketma-ketlik bonusi (+500 gacha)
function scoreCorrect(q, elapsed, streak) {
  const ratio = Math.min(elapsed / (q.time * 1000), 1);
  let points = Math.round(1000 * (1 - ratio / 2)) * q.points;
  if (q.points > 0 && streak > 1) points += Math.min((streak - 1) * 100, 500);
  return points;
}

function resultsCsv(questions, rows, extraHead = []) {
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Oʻrin', 'Ism', ...extraHead, 'Ball', 'Toʻgʻri javoblar', ...questions.map((_, i) => `${i + 1}-savol`)];
  const lines = rows.map(r => [r.rank, r.name, ...(r.extra || []), r.score, `${r.correctCount}/${questions.length}`, ...questions.map((q, i) => {
    const h = r.history[i];
    if (!h || h.choice === null) return 'Javob yoʻq';
    return `${h.correct ? '✔' : '✘'} ${q.options[h.choice]} (${(h.elapsed / 1000).toFixed(1)}s)`;
  })]);
  return '﻿' + [head, ...lines].map(r => r.map(esc).join(',')).join('\r\n');
}
function sendCsv(res, name, csv) {
  res.set('Content-Disposition', `attachment; filename="${name}"`).type('text/csv; charset=utf-8').send(csv);
}

// ---------- Jonli oʻyin ----------
// state: lobby → getready → question → reveal → leaderboard → (getready …) → ended

const games = new Map(); // pin → game

function makePin() {
  let pin;
  do pin = String(Math.floor(100000 + Math.random() * 900000));
  while (games.has(pin));
  return pin;
}

const livePlayers = game => [...game.players.values()].filter(p => !p.kicked);
const publicPlayers = game => livePlayers(game).map(p => ({ id: p.id, name: p.name, connected: p.connected }));

function ranking(game) {
  return livePlayers(game)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .map((p, i) => ({ id: p.id, name: p.name, score: p.score, rank: i + 1, correctCount: p.correctCount, team: p.team ?? null }));
}

// Jamoa bali — aʼzolar balining oʻrtachasi (kichik jamoalar ham teng sharoitda)
function teamRanking(game) {
  if (!game.teamCount) return null;
  const teams = TEAM_NAMES.slice(0, game.teamCount).map((name, index) => ({ index, name, members: 0, total: 0 }));
  for (const p of livePlayers(game)) {
    if (p.team != null) {
      teams[p.team].members++;
      teams[p.team].total += p.score;
    }
  }
  return teams
    .map(t => ({ index: t.index, name: t.name, members: t.members, score: t.members ? Math.round(t.total / t.members) : 0 }))
    .sort((a, b) => b.score - a.score)
    .map((t, i) => ({ ...t, rank: i + 1 }));
}
function teamOf(game, p, teams) {
  if (!teams || p.team == null) return null;
  const t = teams.find(x => x.index === p.team);
  return { index: t.index, name: t.name, rank: t.rank, score: t.score, total: teams.length };
}

const currentQ = game => game.quiz.questions[game.qIndex];

function questionPayload(game) {
  const q = currentQ(game);
  // Toʻgʻri javob yuborilmaydi. Vaqt "qolgan millisekund" koʻrinishida — telefon soati notoʻgʻri boʻlsa ham taymer toʻgʻri ishlaydi
  return {
    index: game.qIndex, total: game.quiz.questions.length, text: q.text, type: q.type, image: q.image,
    options: q.options, time: q.time, points: q.points, raw: game.quiz.lang === 'other',
    remaining: Math.max(0, game.questionStartedAt + q.time * 1000 - Date.now()),
  };
}

function toHost(game, ev, data) {
  if (game.hostSocketId) io.to(game.hostSocketId).emit(ev, data);
}
function toPlayers(game, ev, data) {
  io.to(`players:${game.pin}`).emit(ev, data);
}
function clearTimer(game) {
  if (game.timer) clearTimeout(game.timer);
  game.timer = null;
}

function startQuestion(game) {
  const q = currentQ(game);
  game.state = 'getready';
  game.answers = new Map();
  const head = { index: game.qIndex, total: game.quiz.questions.length, text: q.text, points: q.points, raw: game.quiz.lang === 'other' };
  toHost(game, 'q:getready', head);
  toPlayers(game, 'q:getready', head);

  clearTimer(game);
  game.timer = setTimeout(() => {
    game.state = 'question';
    game.questionStartedAt = Date.now();
    const payload = questionPayload(game);
    toHost(game, 'q:show', payload);
    toPlayers(game, 'q:show', payload);
    game.timer = setTimeout(() => reveal(game), q.time * 1000 + 300);
  }, GET_READY_MS);
}

const activePlayers = game => livePlayers(game).filter(p => p.connected);

function reveal(game) {
  if (game.state !== 'question') return;
  clearTimer(game);
  game.state = 'reveal';
  const q = currentQ(game);
  const counts = q.options.map(() => 0);

  for (const p of livePlayers(game)) {
    const a = game.answers.get(p.id);
    let points = 0;
    let correct = false;
    if (a) {
      counts[a.choice]++;
      correct = q.correct.includes(a.choice);
      if (correct) {
        p.streak++;
        points = scoreCorrect(q, a.elapsed, p.streak);
        p.correctCount++;
      } else p.streak = 0;
    } else p.streak = 0;
    p.score += points;
    p.history[game.qIndex] = { choice: a ? a.choice : null, correct, points, elapsed: a ? a.elapsed : null };
    p.lastResult = { correct, answered: !!a, points, streak: p.streak };
  }

  const ranks = ranking(game);
  const teams = teamRanking(game);
  toHost(game, 'q:reveal', { correct: q.correct, counts, answered: game.answers.size, isLast: game.qIndex === game.quiz.questions.length - 1 });

  for (const r of ranks) {
    const p = game.players.get(r.id);
    const ahead = ranks[r.rank - 2];
    if (p.socketId) {
      io.to(p.socketId).emit('q:result', {
        ...p.lastResult,
        score: p.score,
        rank: r.rank,
        totalPlayers: ranks.length,
        behind: ahead ? { name: ahead.name, gap: ahead.score - p.score } : null,
        correctText: q.correct.map(i => q.options[i]).join(', '),
        raw: game.quiz.lang === 'other',
        team: teamOf(game, p, teams),
      });
    }
  }
}

function showLeaderboard(game) {
  game.state = 'leaderboard';
  toHost(game, 'leaderboard', { top: ranking(game).slice(0, 5), teams: teamRanking(game), isLast: game.qIndex === game.quiz.questions.length - 1 });
}

function endPayloadFor(game, p, ranks, teams) {
  const r = ranks.find(x => x.id === p.id);
  return { rank: r.rank, score: r.score, totalPlayers: ranks.length, correctCount: r.correctCount, totalQuestions: game.quiz.questions.length, team: teamOf(game, p, teams) };
}

function sendEnd(game) {
  const ranks = ranking(game);
  const teams = teamRanking(game);
  toHost(game, 'game:end', { podium: ranks.slice(0, 3), all: ranks, teams, teamNames: TEAM_NAMES });
  for (const p of livePlayers(game)) {
    if (p.socketId) io.to(p.socketId).emit('game:end', endPayloadFor(game, p, ranks, teams));
  }
}

function endGame(game) {
  clearTimer(game);
  game.state = 'ended';
  sendEnd(game);
  // Natijalar uchun bir soat saqlanadi, keyin oʻchiriladi
  setTimeout(() => games.delete(game.pin), 60 * 60 * 1000);
}

// Oʻyinchiga joriy holatni yuborish (qayta ulanganda)
function syncPlayer(game, p, socket) {
  const teams = teamRanking(game);
  const base = { pin: game.pin, name: p.name, score: p.score, quizTitle: game.quiz.title, team: teamOf(game, p, teams) };
  if (game.state === 'lobby') return socket.emit('sync', { ...base, state: 'lobby' });
  if (game.state === 'ended') return socket.emit('game:end', endPayloadFor(game, p, ranking(game), teams));
  if (game.state === 'question' && !game.answers.has(p.id)) {
    socket.emit('sync', { ...base, state: 'playing' });
    return socket.emit('q:show', questionPayload(game));
  }
  socket.emit('sync', { ...base, state: 'waiting' });
}

app.get('/api/games/:pin/results.csv', (req, res) => {
  const game = games.get(req.params.pin);
  if (!game || req.query.token !== game.hostToken) return res.status(404).send('Topilmadi');
  const rows = ranking(game).map(r => {
    const p = game.players.get(r.id);
    return { ...r, history: p.history, extra: game.teamCount ? [p.team != null ? TEAM_NAMES[p.team] : ''] : [] };
  });
  sendCsv(res, `bilimdon-${game.pin}.csv`, resultsCsv(game.quiz.questions, rows, game.teamCount ? ['Jamoa'] : []));
});

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

io.on('connection', socket => {
  // --- Boshlovchi (oʻqituvchi) ---
  socket.on('host:create', ({ quizId }, ack) => {
    const user = userFromCookie(socket.handshake.headers.cookie);
    if (!user) return ack({ error: 'Iltimos, tizimga kiring' });
    const quiz = quizzes.find(q => q.id === quizId && canRead(q, user));
    if (!quiz) return ack({ error: 'Viktorina topilmadi' });
    const game = {
      pin: makePin(),
      hostToken: crypto.randomBytes(16).toString('hex'),
      hostSocketId: socket.id,
      ownerId: user.id,
      quiz: JSON.parse(JSON.stringify(quiz)),
      state: 'lobby',
      qIndex: -1,
      players: new Map(),
      answers: new Map(),
      timer: null,
      locked: false,
      teamCount: 0,
    };
    games.set(game.pin, game);
    socket.data.hostPin = game.pin;
    ack({ pin: game.pin, hostToken: game.hostToken, title: quiz.title, total: quiz.questions.length, raw: quiz.lang === 'other' });
  });

  socket.on('host:rejoin', ({ pin, hostToken }, ack) => {
    const game = games.get(pin);
    if (!game || game.hostToken !== hostToken) return ack({ error: 'Oʻyin topilmadi' });
    game.hostSocketId = socket.id;
    socket.data.hostPin = pin;
    ack({ ok: true, state: game.state, title: game.quiz.title, raw: game.quiz.lang === 'other', players: publicPlayers(game), teamCount: game.teamCount, locked: game.locked });
    if (game.state === 'leaderboard' || game.state === 'reveal') showLeaderboard(game);
    if (game.state === 'ended') toHost(game, 'game:end', { podium: ranking(game).slice(0, 3), all: ranking(game), teams: teamRanking(game) });
    if (game.state === 'question') toHost(game, 'q:show', questionPayload(game));
  });

  const hostGame = () => {
    const game = games.get(socket.data.hostPin);
    return game && game.hostSocketId === socket.id ? game : null;
  };

  socket.on('host:teams', n => {
    const game = hostGame();
    if (game && game.state === 'lobby') game.teamCount = [0, 2, 3, 4].includes(+n) ? +n : 0;
  });

  socket.on('host:start', () => {
    const game = hostGame();
    if (!game || game.state !== 'lobby' || livePlayers(game).length === 0) return;
    if (game.teamCount) shuffle(livePlayers(game)).forEach((p, i) => (p.team = i % game.teamCount));
    game.qIndex = 0;
    const teams = teamRanking(game);
    for (const p of livePlayers(game)) {
      if (p.socketId) io.to(p.socketId).emit('game:started', { title: game.quiz.title, team: teamOf(game, p, teams) });
    }
    startQuestion(game);
  });

  socket.on('host:skip', () => {
    const game = hostGame();
    if (game && game.state === 'question') reveal(game);
  });

  socket.on('host:next', () => {
    const game = hostGame();
    if (!game) return;
    const last = game.qIndex >= game.quiz.questions.length - 1;
    if (game.state === 'reveal') last ? endGame(game) : showLeaderboard(game);
    else if (game.state === 'leaderboard') {
      if (last) return endGame(game);
      game.qIndex++;
      startQuestion(game);
    }
  });

  socket.on('host:lock', locked => {
    const game = hostGame();
    if (game) game.locked = !!locked;
  });

  socket.on('host:kick', playerId => {
    const game = hostGame();
    const p = game && game.players.get(playerId);
    if (!p) return;
    p.kicked = true;
    if (p.socketId) {
      io.to(p.socketId).emit('kicked');
      io.sockets.sockets.get(p.socketId)?.leave(`players:${game.pin}`);
    }
    toHost(game, 'lobby:players', publicPlayers(game));
  });

  socket.on('host:end', () => {
    const game = hostGame();
    if (game && game.state !== 'ended') endGame(game);
  });

  // --- Oʻyinchi (oʻquvchi) ---
  socket.on('player:check', (pin, ack) => {
    const game = games.get(String(pin).trim());
    if (!game || game.state === 'ended') return ack({ error: 'Bunday PIN-kodli oʻyin topilmadi' });
    ack({ ok: true, title: game.quiz.title, raw: game.quiz.lang === 'other' });
  });

  socket.on('player:join', ({ pin, name, playerId }, ack) => {
    const game = games.get(String(pin).trim());
    if (!game) return ack({ error: 'Bunday PIN-kodli oʻyin topilmadi' });

    // Qayta ulanish
    const existing = playerId && game.players.get(playerId);
    if (existing) {
      if (existing.kicked) return ack({ error: 'Siz oʻyindan chiqarilgansiz' });
      existing.socketId = socket.id;
      existing.connected = true;
      socket.data.player = { pin: game.pin, id: existing.id };
      socket.join(`players:${game.pin}`);
      ack({ ok: true, playerId: existing.id, name: existing.name });
      toHost(game, 'lobby:players', publicPlayers(game));
      return syncPlayer(game, existing, socket);
    }

    if (game.state !== 'lobby') return ack({ error: 'Oʻyin allaqachon boshlangan' });
    if (game.locked) return ack({ error: 'Oʻyin qulflangan' });
    const clean = String(name || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
    if (clean.length < 2) return ack({ error: 'Ism kamida 2 ta harf boʻlsin' });
    if (livePlayers(game).some(p => p.name.toLowerCase() === clean.toLowerCase())) return ack({ error: 'Bu ism band, boshqasini tanlang' });
    if (game.players.size >= 200) return ack({ error: 'Oʻyin toʻla' });

    const p = { id: newId(), name: clean, score: 0, streak: 0, correctCount: 0, history: [], socketId: socket.id, connected: true, kicked: false, team: null };
    game.players.set(p.id, p);
    socket.data.player = { pin: game.pin, id: p.id };
    socket.join(`players:${game.pin}`);
    ack({ ok: true, playerId: p.id, name: p.name });
    socket.emit('sync', { pin: game.pin, name: p.name, score: 0, quizTitle: game.quiz.title, state: 'lobby', team: null });
    toHost(game, 'lobby:players', publicPlayers(game));
  });

  socket.on('player:answer', (choice, ack) => {
    const ref = socket.data.player;
    const game = ref && games.get(ref.pin);
    const p = game && game.players.get(ref.id);
    if (!p || p.kicked || game.state !== 'question' || game.answers.has(p.id)) return ack && ack({ ok: false });
    const q = currentQ(game);
    choice = Number(choice);
    if (!Number.isInteger(choice) || choice < 0 || choice >= q.options.length) return ack && ack({ ok: false });
    game.answers.set(p.id, { choice, elapsed: Date.now() - game.questionStartedAt });
    ack && ack({ ok: true });
    const active = activePlayers(game);
    toHost(game, 'q:answers', { answered: game.answers.size, total: active.length });
    // Hamma javob bergan boʻlsa — kutmasdan natijani koʻrsatish
    if (active.every(x => game.answers.has(x.id))) setTimeout(() => reveal(game), 400);
  });

  socket.on('disconnect', () => {
    const ref = socket.data.player;
    const game = ref && games.get(ref.pin);
    const p = game && game.players.get(ref.id);
    if (p && p.socketId === socket.id) {
      p.connected = false;
      p.socketId = null;
      toHost(game, 'lobby:players', publicPlayers(game));
    }
  });
});

// ---------- Uy vazifasi (oʻz tezligida topshirish) ----------

const MAX_HW_NAME = 40;
const hwSummary = a => ({
  id: a.id, title: a.title, createdAt: a.createdAt, deadline: a.deadline,
  total: a.quiz.questions.length,
  started: a.attempts.length,
  finished: a.attempts.filter(t => t.finishedAt).length,
});
const ownAssignment = (req, res) => {
  const a = assignments.find(x => x.id === req.params.id && x.ownerId === req.user.id);
  if (!a) res.status(404).json({ error: 'Topilmadi' });
  return a;
};
function hwRanking(a) {
  return [...a.attempts]
    .sort((x, y) => !!y.finishedAt - !!x.finishedAt || y.score - x.score || x.startedAt - y.startedAt)
    .map((t, i) => ({ rank: i + 1, id: t.id, name: t.name, score: t.score, correctCount: t.correctCount, answered: t.idx, startedAt: t.startedAt, finishedAt: t.finishedAt, history: t.history }));
}

app.post('/api/assignments', auth, (req, res) => {
  const quiz = quizzes.find(q => q.id === req.body.quizId && canRead(q, req.user));
  if (!quiz) return res.status(404).json({ error: 'Viktorina topilmadi' });
  const deadline = req.body.deadline ? Number(req.body.deadline) : null;
  if (deadline !== null && (!Number.isFinite(deadline) || deadline < Date.now())) return res.status(400).json({ error: 'Muddat kelajakdagi vaqt boʻlishi kerak' });
  const a = {
    id: crypto.randomBytes(4).toString('hex'),
    ownerId: req.user.id,
    title: quiz.title,
    quiz: { title: quiz.title, description: quiz.description, lang: quiz.lang || 'uz', questions: JSON.parse(JSON.stringify(quiz.questions)) },
    createdAt: Date.now(),
    deadline,
    attempts: [],
  };
  assignments.unshift(a);
  save.assignments();
  res.json(hwSummary(a));
});

app.get('/api/assignments', auth, (req, res) => {
  res.json(assignments.filter(a => a.ownerId === req.user.id).map(hwSummary));
});

app.get('/api/assignments/:id', auth, (req, res) => {
  const a = ownAssignment(req, res);
  if (!a) return;
  const finished = a.attempts.filter(t => t.finishedAt);
  const questionStats = a.quiz.questions.map((q, i) => {
    const right = finished.filter(t => t.history[i]?.correct).length;
    return { text: q.text, correctPct: finished.length ? Math.round((right / finished.length) * 100) : null };
  });
  res.json({ ...hwSummary(a), raw: a.quiz.lang === 'other', link: `${baseUrl(req)}/hw.html?k=${a.id}`, results: hwRanking(a).map(({ history, ...r }) => r), questionStats });
});

app.get('/api/assignments/:id/results.csv', auth, (req, res) => {
  const a = ownAssignment(req, res);
  if (!a) return;
  const fmtTime = t => (t ? new Date(t).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' }) : 'Tugatilmagan');
  const rows = hwRanking(a).map(r => ({ ...r, extra: [fmtTime(r.finishedAt)] }));
  sendCsv(res, `uy-vazifasi-${a.id}.csv`, resultsCsv(a.quiz.questions, rows, ['Topshirilgan vaqt']));
});

app.delete('/api/assignments/:id', auth, (req, res) => {
  const a = ownAssignment(req, res);
  if (!a) return;
  assignments = assignments.filter(x => x !== a);
  save.assignments();
  res.json({ ok: true });
});

// --- Oʻquvchi tomoni (hisob kerak emas) ---
const hwClosed = a => a.deadline && Date.now() > a.deadline;
const findAttempt = (a, id) => a.attempts.find(t => t.id === id);

function hwFinal(a, t) {
  const finished = a.attempts.filter(x => x.finishedAt);
  return { done: true, score: t.score, correctCount: t.correctCount, total: a.quiz.questions.length, rank: 1 + finished.filter(x => x.score > t.score).length, finishedCount: finished.length };
}

function hwRecord(a, t, choice) {
  const q = a.quiz.questions[t.idx];
  const elapsed = Date.now() - t.shownAt;
  const valid = Number.isInteger(choice) && choice >= 0 && choice < q.options.length && elapsed <= q.time * 1000 + ANSWER_GRACE_MS;
  const correct = valid && q.correct.includes(choice);
  let points = 0;
  if (correct) {
    t.streak++;
    points = scoreCorrect(q, Math.min(elapsed, q.time * 1000), t.streak);
    t.correctCount++;
  } else t.streak = 0;
  t.score += points;
  t.history[t.idx] = { choice: valid ? choice : null, correct, points, elapsed: valid ? elapsed : null };
  t.idx++;
  t.shownAt = null;
  if (t.idx >= a.quiz.questions.length) t.finishedAt = Date.now();
  return { correct, answered: valid, points, score: t.score, streak: t.streak, correctIdx: q.correct, correctText: q.correct.map(i => q.options[i]).join(', '), isLast: !!t.finishedAt };
}

app.get('/api/hw/:id', (req, res) => {
  const a = assignments.find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Uy vazifasi topilmadi. Havolani tekshiring' });
  res.json({ raw: a.quiz.lang === 'other', title: a.quiz.title, description: a.quiz.description, total: a.quiz.questions.length, deadline: a.deadline, closed: !!hwClosed(a) });
});

app.post('/api/hw/:id/start', (req, res) => {
  const a = assignments.find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Uy vazifasi topilmadi' });
  const resume = req.body.attemptId && findAttempt(a, req.body.attemptId);
  if (resume) return res.json({ attemptId: resume.id, name: resume.name });
  if (hwClosed(a)) return res.status(400).json({ error: 'Topshirish muddati tugagan' });
  const name = String(req.body.name || '').replace(/\s+/g, ' ').trim().slice(0, MAX_HW_NAME);
  if (name.length < 3) return res.status(400).json({ error: 'Ism va familiyangizni toʻliq yozing' });
  if (a.attempts.some(t => t.name.toLowerCase() === name.toLowerCase())) return res.status(400).json({ error: 'Bu ism bilan allaqachon topshirilgan. Familiyangizni ham qoʻshing' });
  if (a.attempts.length >= 500) return res.status(400).json({ error: 'Ishtirokchilar soni chegaraga yetdi' });
  const t = { id: newId(), name, startedAt: Date.now(), finishedAt: null, idx: 0, shownAt: null, score: 0, streak: 0, correctCount: 0, history: [] };
  a.attempts.push(t);
  save.assignments();
  res.json({ attemptId: t.id, name: t.name });
});

app.post('/api/hw/:id/next', (req, res) => {
  const a = assignments.find(x => x.id === req.params.id);
  const t = a && findAttempt(a, req.body.attemptId);
  if (!t) return res.status(404).json({ error: 'Topilmadi' });
  let changed = false;
  while (!t.finishedAt) {
    const q = a.quiz.questions[t.idx];
    if (!t.shownAt) {
      t.shownAt = Date.now();
      changed = true;
    }
    const remaining = t.shownAt + q.time * 1000 - Date.now();
    if (remaining > -ANSWER_GRACE_MS) {
      if (changed) save.assignments();
      return res.json({ raw: a.quiz.lang === 'other', index: t.idx, total: a.quiz.questions.length, text: q.text, type: q.type, image: q.image, options: q.options, time: q.time, points: q.points, remaining: Math.max(0, remaining), score: t.score });
    }
    // Savol ochiq qolib ketgan (sahifa yopilgan) — vaqti tugagan deb hisoblanadi
    hwRecord(a, t, null);
    changed = true;
  }
  if (changed) save.assignments();
  res.json(hwFinal(a, t));
});

app.post('/api/hw/:id/answer', (req, res) => {
  const a = assignments.find(x => x.id === req.params.id);
  const t = a && findAttempt(a, req.body.attemptId);
  if (!t) return res.status(404).json({ error: 'Topilmadi' });
  if (t.finishedAt || !t.shownAt) return res.status(400).json({ error: 'Savol ochilmagan' });
  const result = hwRecord(a, t, req.body.choice === null ? null : Number(req.body.choice));
  save.assignments();
  res.json(t.finishedAt ? { ...result, final: hwFinal(a, t) } : result);
});

// Xatolar — JSON koʻrinishida
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Fayl juda katta (5 MB gacha)' });
  console.error(err);
  res.status(err.status || 500).json({ error: 'Server xatosi' });
});

server.listen(PORT, () => {
  console.log(`\n  Bilimdon ishga tushdi!`);
  console.log(`  Oʻqituvchi:  http://localhost:${PORT}/host.html`);
  console.log(`  Oʻquvchilar: http://${lanAddress()}:${PORT}\n`);
});
