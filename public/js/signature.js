// แผ่นเซ็นชื่อด้วยลายมือจริง (เมาส์ / นิ้ว / ปากกา stylus) — เส้นหนาบางตามความเร็วและแรงกด
export class SignaturePad {
  constructor(canvas, { color = '#1a3a8f', onChange } = {}) {
    this.canvas = canvas;
    this.color = color;
    this.onChange = onChange;
    this.strokes = [];
    this.current = null;
    this.ctx = canvas.getContext('2d');
    this.resize = this.resize.bind(this);
    this._down = this._down.bind(this);
    this._move = this._move.bind(this);
    this._up = this._up.bind(this);
    canvas.addEventListener('pointerdown', this._down);
    canvas.addEventListener('pointermove', this._move);
    window.addEventListener('pointerup', this._up);
    canvas.addEventListener('pointercancel', this._up);
    this.ro = new ResizeObserver(this.resize);
    this.ro.observe(canvas);
  }

  destroy() {
    window.removeEventListener('pointerup', this._up);
    this.ro.disconnect();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.redraw();
  }

  _pt(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp, p: e.pointerType === 'pen' && e.pressure ? e.pressure : 0 };
  }

  _down(e) {
    e.preventDefault();
    this.canvas.setPointerCapture?.(e.pointerId);
    this.current = { color: this.color, pts: [this._pt(e)] };
    this.strokes.push(this.current);
    this._dot(this.current.pts[0], this.current.color);
    this.onChange?.(this);
  }

  _move(e) {
    if (!this.current) return;
    e.preventDefault();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs) {
      const p = this._pt(ev);
      const pts = this.current.pts;
      const last = pts[pts.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) < 1.2) continue;
      p.w = this._width(last, p);
      pts.push(p);
      this._segment(pts, pts.length - 1, this.current.color);
    }
  }

  _up() {
    if (!this.current) return;
    this.current = null;
    this.onChange?.(this);
  }

  _width(a, b) {
    if (b.p) return 0.9 + b.p * 3.4;
    const v = Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, b.t - a.t); // px/ms
    const w = Math.max(1.1, Math.min(3.6, 3.8 - v * 1.6));
    return a.w ? a.w * 0.6 + w * 0.4 : w;
  }

  _dot(p, color, ctx = this.ctx, ox = 0, oy = 0) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x - ox, p.y - oy, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  _segment(pts, i, color, ctx = this.ctx, ox = 0, oy = 0) {
    if (i < 1) return;
    const p0 = pts[i - 2] || pts[i - 1], p1 = pts[i - 1], p2 = pts[i];
    const m1 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    const m2 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = p2.w || 2;
    ctx.beginPath();
    ctx.moveTo(m1.x - ox, m1.y - oy);
    ctx.quadraticCurveTo(p1.x - ox, p1.y - oy, m2.x - ox, m2.y - oy);
    ctx.stroke();
  }

  redraw(ctx = this.ctx, ox = 0, oy = 0, clear = true) {
    if (clear) ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const s of this.strokes) {
      this._dot(s.pts[0], s.color, ctx, ox, oy);
      for (let i = 1; i < s.pts.length; i++) this._segment(s.pts, i, s.color, ctx, ox, oy);
    }
  }

  setColor(c) { this.color = c; }
  undo() { this.strokes.pop(); this.redraw(); this.onChange?.(this); }
  clear() { this.strokes = []; this.redraw(); this.onChange?.(this); }
  isEmpty() { return this.strokes.reduce((n, s) => n + s.pts.length, 0) < 8; }

  /** PNG พื้นหลังโปร่งใส ตัดขอบให้พอดีลายเซ็น */
  toPNG(scale = 2) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of this.strokes) for (const p of s.pts) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }
    if (!isFinite(minX)) return null;
    const pad = 8;
    const w = maxX - minX + pad * 2, h = maxY - minY + pad * 2;
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * scale); c.height = Math.ceil(h * scale);
    const ctx = c.getContext('2d');
    ctx.scale(scale, scale);
    this.redraw(ctx, minX - pad, minY - pad, false);
    return c.toDataURL('image/png');
  }
}
