// เอฟเฟกต์: แสงตามเมาส์บนการ์ด, ripple บนปุ่ม, อนุภาคตามธีมเทศกาล (เบา ๆ ไม่รกตา)
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initSpotlight() {
  document.addEventListener('pointermove', (e) => {
    const el = e.target.closest?.('.spot');
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, { passive: true });
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest?.('.btn');
    if (!b || reduced) return;
    const r = b.getBoundingClientRect();
    const s = Math.max(r.width, r.height);
    const i = document.createElement('span');
    i.className = 'ripple';
    i.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
    b.appendChild(i);
    setTimeout(() => i.remove(), 600);
  });
}

// ---------------- อนุภาค ----------------
const canvas = () => document.getElementById('fx');
let raf = 0, parts = [], kind = null;

const KINDS = {
  snow: { n: 34, make: (w, h) => ({ x: rnd(w), y: rnd(h), r: 1.2 + rnd(2.6), vy: 0.3 + rnd(0.7), vx: 0, sway: rnd(6.28), a: 0.35 + rnd(0.45), c: '#ffffff' }), draw: dot },
  confetti: { n: 30, make: (w, h) => ({ x: rnd(w), y: rnd(h), r: 3 + rnd(3), vy: 0.5 + rnd(0.8), vx: 0, sway: rnd(6.28), rot: rnd(6.28), vr: rnd(0.06) - 0.03, a: 0.55, c: pick(['#ffcf5a', '#ff6fb5', '#6aa8ff', '#3ddc84', '#b07cff']) }), draw: rect },
  heart: { n: 16, make: (w, h) => ({ x: rnd(w), y: h + rnd(h), r: 5 + rnd(6), vy: -(0.25 + rnd(0.5)), vx: 0, sway: rnd(6.28), a: 0.25 + rnd(0.3), c: pick(['#ff5c8a', '#ff8fb1', '#e8336b']) }), draw: heart, up: true },
  lantern: { n: 12, make: (w, h) => ({ x: rnd(w), y: h + rnd(h), r: 7 + rnd(6), vy: -(0.18 + rnd(0.3)), vx: 0, sway: rnd(6.28), a: 0.5 + rnd(0.3), c: '#e01e37' }), draw: lantern, up: true },
  drop: { n: 26, make: (w, h) => ({ x: rnd(w), y: rnd(h), r: 2 + rnd(2.5), vy: 1.2 + rnd(1.5), vx: 0, sway: 0, a: 0.3 + rnd(0.3), c: pick(['#3cc6ea', '#7fdcf5', '#ffffff']) }), draw: drop },
  jasmine: { n: 16, make: (w, h) => ({ x: rnd(w), y: rnd(h), r: 4 + rnd(4), vy: 0.3 + rnd(0.5), vx: 0, sway: rnd(6.28), rot: rnd(6.28), vr: 0.01, a: 0.55, c: '#ffffff' }), draw: flower },
  marigold: { n: 16, make: (w, h) => ({ x: rnd(w), y: rnd(h), r: 4 + rnd(4), vy: 0.3 + rnd(0.5), vx: 0, sway: rnd(6.28), rot: rnd(6.28), vr: 0.01, a: 0.55, c: pick(['#ffc400', '#ffb000', '#ffd84d']) }), draw: flower },
  ember: { n: 24, make: (w, h) => ({ x: rnd(w), y: h + rnd(h), r: 1.2 + rnd(2.2), vy: -(0.3 + rnd(0.6)), vx: 0, sway: rnd(6.28), a: 0.5, c: pick(['#ff8c1a', '#ffb347', '#a855f7']), glow: 10 }), draw: dot, up: true },
  lights: { n: 26, make: (w, h) => ({ x: rnd(w), y: h + rnd(h), r: 1.5 + rnd(2.5), vy: -(0.2 + rnd(0.45)), vx: 0, sway: rnd(6.28), a: 0.6, c: pick(['#ffd36b', '#ffe9a8', '#ffb3d9']), glow: 14 }), draw: dot, up: true },
  balloon: { n: 10, make: (w, h) => ({ x: rnd(w), y: h + rnd(h), r: 9 + rnd(6), vy: -(0.3 + rnd(0.4)), vx: 0, sway: rnd(6.28), a: 0.35, c: pick(['#ff7a3d', '#3db7ff', '#ffcf3d', '#9b5de5', '#3ddc84']) }), draw: balloon, up: true },
};

const rnd = (n) => Math.random() * n;
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function dot(c, p) {
  if (p.glow) { c.shadowBlur = p.glow; c.shadowColor = p.c; }
  c.fillStyle = p.c; c.beginPath(); c.arc(0, 0, p.r, 0, 6.283); c.fill();
}
function rect(c, p) { c.rotate(p.rot); c.fillStyle = p.c; c.fillRect(-p.r / 2, -p.r, p.r, p.r * 2); }
function heart(c, p) {
  const s = p.r / 10; c.scale(s, s); c.fillStyle = p.c; c.beginPath();
  c.moveTo(0, 6); c.bezierCurveTo(-12, -3, -6, -12, 0, -5); c.bezierCurveTo(6, -12, 12, -3, 0, 6); c.fill();
}
function lantern(c, p) {
  const r = p.r; c.shadowBlur = 18; c.shadowColor = '#ff5a3c';
  c.fillStyle = p.c; c.beginPath(); c.ellipse(0, 0, r, r * 1.25, 0, 0, 6.283); c.fill();
  c.shadowBlur = 0; c.fillStyle = '#ffcf3d'; c.fillRect(-r * 0.5, -r * 1.35, r, r * 0.25); c.fillRect(-r * 0.5, r * 1.1, r, r * 0.25);
  c.fillRect(-0.6, r * 1.35, 1.2, r * 0.7);
}
function drop(c, p) {
  c.fillStyle = p.c; c.beginPath(); c.moveTo(0, -p.r * 2.2); c.quadraticCurveTo(p.r, 0, 0, p.r); c.quadraticCurveTo(-p.r, 0, 0, -p.r * 2.2); c.fill();
}
function flower(c, p) {
  c.rotate(p.rot); c.fillStyle = p.c;
  for (let i = 0; i < 5; i++) { c.rotate(1.2566); c.beginPath(); c.ellipse(0, -p.r * 0.6, p.r * 0.38, p.r * 0.6, 0, 0, 6.283); c.fill(); }
  c.fillStyle = '#f5b400'; c.beginPath(); c.arc(0, 0, p.r * 0.25, 0, 6.283); c.fill();
}
function balloon(c, p) {
  c.fillStyle = p.c; c.beginPath(); c.ellipse(0, 0, p.r * 0.85, p.r, 0, 0, 6.283); c.fill();
  c.strokeStyle = p.c; c.lineWidth = 1; c.beginPath(); c.moveTo(0, p.r); c.quadraticCurveTo(4, p.r * 1.8, 0, p.r * 2.6); c.stroke();
}

export function setParticles(next) {
  const cv = canvas();
  if (!cv) return;
  if (reduced) next = null;
  if (next === kind) return;
  kind = next;
  cancelAnimationFrame(raf);
  const c = cv.getContext('2d');
  const fit = () => { const d = Math.min(2, devicePixelRatio || 1); cv.width = innerWidth * d; cv.height = innerHeight * d; c.setTransform(d, 0, 0, d, 0, 0); };
  fit();
  window.onresize = fit;
  c.clearRect(0, 0, cv.width, cv.height);
  if (!kind || !KINDS[kind]) { parts = []; return; }
  const K = KINDS[kind];
  const n = innerWidth < 700 ? Math.ceil(K.n * 0.55) : K.n;
  parts = Array.from({ length: n }, () => K.make(innerWidth, innerHeight));
  let t = 0;
  const loop = () => {
    t += 0.016;
    c.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.y += p.vy;
      p.x += Math.sin(t + p.sway) * 0.35;
      if (p.vr) p.rot += p.vr;
      const out = K.up ? p.y < -40 : p.y > innerHeight + 40;
      if (out) { Object.assign(p, K.make(innerWidth, innerHeight)); p.y = K.up ? innerHeight + 30 : -30; }
      c.save(); c.globalAlpha = p.a; c.translate(p.x, p.y); K.draw(c, p); c.restore();
    }
    raf = requestAnimationFrame(loop);
  };
  if (!document.hidden) loop();
  document.onvisibilitychange = () => { cancelAnimationFrame(raf); if (!document.hidden && kind) loop(); };
}
