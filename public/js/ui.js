// ตัวช่วยสร้าง UI: h(), ไอคอน, toast, modal, drawer, เรียก API
import * as sound from './sound.js';

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}
function append(el, kids) {
  for (const c of kids.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

const P = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  petition: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  printer: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  palette: '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2a10 10 0 0 0 0 20c.9 0 1.5-.7 1.5-1.5 0-.4-.1-.7-.4-1-.3-.3-.4-.6-.4-1 0-.8.7-1.5 1.5-1.5H16a6 6 0 0 0 6-6c0-5-4.5-9-10-9z"/>',
  volume: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.9-1"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/>',
  rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  telegram: '<path d="m22 3-20 8 7 2 2 7 4-5 5 4z"/><path d="m9 13 13-10"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
  archive: '<path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  signature: '<path d="M3 17c3-1 4-9 6-9s-1 9 1 9 3-5 5-5 1 4 3 4 2-2 3-2"/><path d="M3 21h18"/>',
};
export function icon(name, cls) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.9');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  if (cls) s.setAttribute('class', cls);
  s.innerHTML = P[name] || '';
  return s;
}

// ---------------- API ----------------
// ทำงานได้ 2 แบบ: Node.js (fetch + cookie) และ Google Apps Script (google.script.run + token ใน localStorage)
export const GAS = typeof google !== 'undefined' && !!google.script?.run;
const TOKEN_KEY = 'ledger.token';
const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} };

function gasCall(method, path, body) {
  return new Promise((resolve, reject) => {
    google.script.run
      .withSuccessHandler((r) => {
        if (r && r.__error) {
          const err = new Error(r.__error);
          err.status = r.status;
          return reject(err);
        }
        if (r && '__token' in r) { setToken(r.__token); delete r.__token; }
        resolve(r);
      })
      .withFailureHandler((e) => reject(new Error(e?.message || String(e))))
      .api(method, path, body || null, getToken());
  });
}

async function rawApi(path, { method = 'GET', body } = {}) {
  if (GAS) return gasCall(method, path, body);
  const res = await fetch(path, {
    method, credentials: 'same-origin',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `เกิดข้อผิดพลาด (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/** ดาวน์โหลดไฟล์จาก API (CSV / ไฟล์สำรอง) */
export async function download(path) {
  if (!GAS) { location.href = path; return; }
  const r = await track('GET', path, () => gasCall('GET', path), 'กำลังเตรียมไฟล์…');
  if (r.__link) { window.open(r.__link, '_blank'); return r; }
  const blob = new Blob([r.text], { type: r.type || 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = r.filename || 'download';
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  return r;
}

// ---------------- สถานะการรอ (กันผู้ใช้คิดว่าค้างและกดซ้ำ) ----------------
// - ทุกคำขอ: แถบความคืบหน้าด้านบนจอ
// - คำสั่งที่บันทึกข้อมูล (POST/PUT/DELETE): ปุ่มที่กดขึ้นวงหมุนและกดซ้ำไม่ได้ ถ้าเกิน 0.35 วินาที จะขึ้นหน้าต่าง "กำลัง…" บังจอไว้
// - การโหลดข้อมูล (GET) ที่นานเกิน 1.2 วินาที: แสดงป้ายเล็ก "กำลังโหลดข้อมูล…" มุมจอ โดยไม่บังการใช้งาน
const ACTION_TEXT = [
  [/\/issue$/, 'กำลังออกเลข…'], [/\/reserve$/, 'กำลังจองเลข…'], [/\/sign$/, 'กำลังบันทึกลายมือชื่อ…'],
  [/\/cancel$/, 'กำลังยกเลิกเลข…'], [/^\/api\/entries\/\d+$/, 'กำลังบันทึกรายละเอียด…'],
  [/\/login$/, 'กำลังเข้าสู่ระบบ…'], [/\/logout$/, 'กำลังออกจากระบบ…'], [/\/register$/, 'กำลังส่งคำขอสมัคร…'],
  [/\/setup$/, 'กำลังตั้งค่าระบบครั้งแรก…'], [/\/unlock$/, 'กำลังตรวจสอบ PIN…'], [/\/lock$/, 'กำลังล็อกผู้ดูแล…'],
  [/\/admin\/users\//, 'กำลังบันทึกข้อมูลสมาชิก…'], [/\/admin\/books/, 'กำลังบันทึกสมุด…'],
  [/\/telegram\/test$/, 'กำลังทดสอบส่งข้อความ…'], [/\/telegram\/daily$/, 'กำลังส่งสรุปเข้า Telegram…'], [/\/telegram\/detect$/, 'กำลังค้นหาแชท…'],
  [/\/triggers$/, 'กำลังติดตั้งตัวตั้งเวลา…'], [/\/update\/check$/, 'กำลังตรวจสอบอัพเดต…'], [/\/update\/apply$/, 'กำลังติดตั้งอัพเดต…'],
  [/\/backup$/, 'กำลังสร้างสำเนาสำรอง…'], [/\/me\/prefs$/, null], [/\/admin\/pin$/, 'กำลังเปลี่ยน PIN…'],
];
const QUIET = [/\/api\/badges$/, /\/api\/me\/prefs$/]; // งานเบื้องหลัง ไม่ต้องแจ้งผู้ใช้
let inflight = 0, writes = 0, lastBtn = null, lastBtnAt = 0, waitEl = null, pillEl = null, barEl = null;

document.addEventListener('click', (e) => {
  const b = e.target.closest?.('button, .btn');
  if (b) { lastBtn = b; lastBtnAt = Date.now(); }
}, true);
document.addEventListener('submit', (e) => {
  const b = e.target.querySelector('button[type=submit], button:not([type])');
  if (b) { lastBtn = b; lastBtnAt = Date.now(); }
}, true);

function bar(on) {
  if (!barEl) { barEl = h('div', { class: 'net-bar' }); document.body.append(barEl); }
  barEl.classList.toggle('on', on);
}
function showWait(text) {
  if (!waitEl) {
    waitEl = h('div', { class: 'wait-ov', role: 'alertdialog', 'aria-live': 'assertive', 'aria-busy': 'true' },
      h('div', { class: 'wait-card glass' }, h('div', { class: 'spinner' }), h('b', { class: 'wait-t' }), h('small', { class: 'wait-s' })));
    document.body.append(waitEl);
  }
  waitEl.querySelector('.wait-t').textContent = text;
  waitEl.querySelector('.wait-s').textContent = 'กรุณารอสักครู่ ไม่ต้องกดซ้ำ';
  waitEl.classList.add('on');
  clearTimeout(waitEl._slow);
  waitEl._slow = setTimeout(() => {
    waitEl.querySelector('.wait-s').textContent = GAS ? 'Google กำลังประมวลผล อาจใช้เวลาสักครู่ — ระบบยังทำงานอยู่ ไม่ต้องกดซ้ำ' : 'ระบบยังทำงานอยู่ ไม่ต้องกดซ้ำ';
  }, 5000);
}
function hideWait() { if (waitEl) { waitEl.classList.remove('on'); clearTimeout(waitEl._slow); } }
function pill(on) {
  if (!pillEl) { pillEl = h('div', { class: 'load-pill glass' }, h('i', { class: 'spinner sm' }), 'กำลังโหลดข้อมูล…'); document.body.append(pillEl); }
  pillEl.classList.toggle('on', on);
}

async function track(method, path, run, label) {
  const quiet = QUIET.some((r) => r.test(path.split('?')[0]));
  if (quiet) return run();
  const write = method !== 'GET' || !!label;
  const p = path.split('?')[0];
  const text = label || (ACTION_TEXT.find(([r]) => r.test(p)) || [, 'กำลังบันทึกข้อมูล…'])[1] || 'กำลังบันทึกข้อมูล…';
  inflight++; bar(true);
  let btn = null, timer;
  if (write) {
    writes++;
    if (lastBtn && Date.now() - lastBtnAt < 1500 && lastBtn.isConnected && !lastBtn.classList.contains('is-loading')) {
      btn = lastBtn;
      btn.classList.add('is-loading');
      btn.disabled = true;
    }
    timer = setTimeout(() => showWait(text), 350);
  } else {
    timer = setTimeout(() => pill(true), 1200);
  }
  try {
    return await run();
  } finally {
    clearTimeout(timer);
    inflight--;
    if (write) { writes--; if (!writes) hideWait(); }
    if (!inflight) { bar(false); pill(false); }
    if (btn) { btn.classList.remove('is-loading'); btn.disabled = false; }
  }
}

export function api(path, opts = {}) {
  return track(opts.method || 'GET', path, () => rawApi(path, opts));
}

// ---------------- toast ----------------
export function toast(msg, type = 'ok') {
  const t = h('div', { class: `toast glass ${type}` }, icon(type === 'err' ? 'x' : type === 'info' ? 'bell' : 'check'), h('span', null, msg));
  document.getElementById('toasts').append(t);
  if (type === 'err') sound.error();
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 260); }, type === 'err' ? 5000 : 3200);
}

export async function attempt(fn, okMsg) {
  try {
    const r = await fn();
    if (okMsg) toast(okMsg);
    return r;
  } catch (e) {
    toast(e.message, 'err');
    throw e;
  }
}

// ---------------- modal / drawer ----------------
const stack = [];
export function openModal(content, { size = '', drawer = false, onClose } = {}) {
  const box = h('div', { class: `${drawer ? 'drawer' : `modal ${size}`} glass`, role: 'dialog', 'aria-modal': 'true' });
  const ov = h('div', { class: `overlay${drawer ? ' drawer-ov' : ''}` }, box);
  const close = () => {
    if (ov.classList.contains('closing')) return;
    ov.classList.add('closing');
    stack.splice(stack.indexOf(api_), 1);
    setTimeout(() => { ov.remove(); onClose?.(); }, 220);
  };
  const api_ = { el: box, close };
  ov.addEventListener('pointerdown', (e) => { if (e.target === ov) ov._down = true; });
  ov.addEventListener('click', (e) => { if (e.target === ov && ov._down) close(); ov._down = false; });
  stack.push(api_);
  document.body.append(ov);
  const c = typeof content === 'function' ? content(api_) : content;
  append(box, [c]);
  setTimeout(() => box.querySelector('input:not([type=hidden]):not([readonly]), textarea, select')?.focus(), 60);
  return api_;
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && stack.length) stack[stack.length - 1].close(); });
export const closeAllModals = () => [...stack].forEach((m) => m.close());

export function modalHead(title, sub, close) {
  return h('div', { class: 'modal-head' },
    h('div', null, h('h2', null, title), sub ? h('p', null, sub) : null),
    h('button', { class: 'btn ghost icon', onclick: close, 'aria-label': 'ปิด' }, icon('x')));
}

export function confirmBox(title, message, { ok = 'ยืนยัน', danger = false, input } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const inp = input ? h('textarea', { class: 'input', placeholder: input, rows: 3 }) : null;
    const m = openModal(({ close }) => [
      modalHead(title, null, close),
      h('p', { style: { margin: 0, color: 'var(--muted)' } }, message),
      inp ? h('div', { class: 'field', style: { marginTop: '14px' } }, inp) : null,
      h('div', { class: 'modal-foot' },
        h('button', { class: 'btn ghost', onclick: close }, 'ยกเลิก'),
        h('button', { class: `btn ${danger ? 'danger solid' : 'primary'}`, onclick: () => { done = true; resolve(input ? inp.value : true); close(); } }, ok)),
    ], { size: 'narrow', onClose: () => !done && resolve(false) });
    return m;
  });
}

export function field(label, input, { required, hint, wide } = {}) {
  return h('label', { class: `field${wide ? ' wide' : ''}` }, h('span', null, label, required ? h('em', null, ' *') : null), input, hint ? h('small', { class: 'hint' }, hint) : null);
}

export function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

export function busy(btn, on) {
  if (!btn) return;
  btn.disabled = on;
  if (on) { btn.dataset.t = btn.textContent; btn.style.minWidth = btn.offsetWidth + 'px'; }
}
