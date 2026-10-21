// Umumiy yordamchi funksiyalar
const $ = sel => document.querySelector(sel);
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const SHAPES = [
  '<svg class="shape" viewBox="0 0 32 32"><path d="M16 3 30 28H2z"/></svg>',
  '<svg class="shape" viewBox="0 0 32 32"><path d="M16 2 30 16 16 30 2 16z"/></svg>',
  '<svg class="shape" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14"/></svg>',
  '<svg class="shape" viewBox="0 0 32 32"><rect x="3" y="3" width="26" height="26"/></svg>',
];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(msg, ms = 2600) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 300);
}

// Ekranni almashtirish — yangi ekran yumshoq paydo boʻladi
function show(id) {
  document.querySelectorAll('.screen').forEach(s => {
    const on = s.id === id;
    if (on && s.classList.contains('hidden')) {
      s.classList.remove('enter');
      void s.offsetWidth;
      s.classList.add('enter');
    }
    s.classList.toggle('hidden', !on);
  });
}

function fmt(n) {
  return Number(n).toLocaleString('ru-RU').replace(/,/g, ' ');
}

// Raqamni 0 dan (yoki from dan) sanab chiqish
function countUp(el, to, { from = 0, ms = 900, prefix = '', suffix = '' } = {}) {
  if (reducedMotion() || to === from) return void (el.textContent = prefix + fmt(to) + suffix);
  const start = performance.now();
  const step = now => {
    const t = Math.min(1, (now - start) / ms);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = prefix + fmt(Math.round(from + (to - from) * eased)) + suffix;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Konfetti (kutubxonasiz, kichik canvas)
function confetti({ count = 140, duration = 3200 } = {}) {
  if (reducedMotion()) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const resize = () => {
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
  };
  resize();
  const colors = ['#e21b3c', '#1368ce', '#ffd84d', '#26890c', '#0099b5', '#ffffff'];
  const parts = Array.from({ length: count }, () => ({
    x: Math.random() * innerWidth,
    y: -20 - Math.random() * innerHeight * 0.5,
    w: 6 + Math.random() * 6,
    h: 8 + Math.random() * 8,
    vx: -2 + Math.random() * 4,
    vy: 2 + Math.random() * 4,
    r: Math.random() * Math.PI,
    vr: -0.2 + Math.random() * 0.4,
    c: colors[Math.floor(Math.random() * colors.length)],
  }));
  const start = performance.now();
  const frame = now => {
    const elapsed = now - start;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, elapsed - duration + 800) / 800);
    for (const p of parts) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.04;
      p.r += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r)));
      ctx.restore();
    }
    if (elapsed < duration) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

// Oddiy ovoz effektlari (WebAudio, fayl kerak emas)
const Sound = {
  ctx: null,
  on: true,
  beep(freq = 660, dur = 0.12, type = 'sine', vol = 0.15) {
    if (!this.on) return;
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
      o.connect(g).connect(this.ctx.destination);
      o.start();
      o.stop(this.ctx.currentTime + dur);
    } catch {}
  },
  tick() { this.beep(880, 0.06, 'square', 0.05); },
  good() { [523, 659, 784].forEach((f, i) => setTimeout(() => this.beep(f, 0.18, 'triangle'), i * 110)); },
  bad() { this.beep(220, 0.35, 'sawtooth', 0.08); },
  fanfare() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.beep(f, 0.3, 'triangle', 0.18), i * 160)); },
};
