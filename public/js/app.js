import { h, icon, api, toast, attempt, openModal, modalHead, confirmBox, field, formData, closeAllModals } from './ui.js';
import { THEMES, FESTIVAL_THEMES, applyTheme, getTheme } from './themes.js';
import * as sound from './sound.js';
import { initSpotlight, setParticles } from './effects.js';
import { SignaturePad } from './signature.js';
import { BOOK_TYPES, COLUMN_LABELS, STATUS_LABEL, displayNo } from './shared/schema.js';
import { thaiDate, thaiDateTime, bkkNow, TH_MONTHS, toBE } from './shared/thaidate.js';
import { activeFestival, upcomingFestivals } from './shared/festivals.js';

const S = { boot: null, user: null, isAdmin: false, books: [], badges: { perBook: {}, mine: 0, total: 0 }, prefs: {} };
const $app = document.getElementById('app');

// ======================================================================
// ธีม / เสียง / ค่ากำหนด
// ======================================================================
function loadLocalPrefs() {
  try { return JSON.parse(localStorage.getItem('ledger.prefs') || '{}'); } catch { return {}; }
}
function prefs() { return { theme: null, sound: 'soft', soundVolume: 0.5, festival: true, particles: true, ...loadLocalPrefs(), ...(S.user?.prefs || {}) }; }

async function savePrefs(patch) {
  const next = { ...prefs(), ...patch };
  try { localStorage.setItem('ledger.prefs', JSON.stringify(next)); } catch {}
  if (S.user) { S.user.prefs = next; api('/api/me/prefs', { method: 'PUT', body: patch }).catch(() => {}); }
  applyLook();
}

/** ลำดับ: ธีมเทศกาลที่แอดมินบังคับ > ธีมเทศกาลอัตโนมัติ (ถ้าเปิด) > ธีมที่ผู้ใช้เลือก > ตามโหมดสีเครื่อง */
function resolveTheme() {
  const p = prefs();
  const f = S.boot?.festival;
  if (f?.force && FESTIVAL_THEMES[f.force]) return { id: f.force, festival: true };
  const fest = activeFestival(bkkNow().date);
  if (f?.auto && p.festival !== false && fest && FESTIVAL_THEMES[fest.id]) return { id: fest.id, festival: true, fest };
  if (p.theme && getTheme(p.theme)) return { id: p.theme };
  return { id: matchMedia('(prefers-color-scheme: dark)').matches ? 'midnight' : 'paper' };
}

function applyLook() {
  const r = resolveTheme();
  const t = applyTheme(r.id);
  setParticles(prefs().particles !== false ? t.particles || null : null);
  const p = prefs();
  sound.setSound(p.sound, p.soundVolume);
}

document.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button, .btn, a, .nav a, .seg button, .theme-card, input[type=checkbox], tr[data-id]')) sound.click();
}, true);

// ======================================================================
// Router
// ======================================================================
const ROUTES = [
  ['/setup', viewSetup, 'public'],
  ['/login', viewLogin, 'public'],
  ['/register', viewRegister, 'public'],
  ['/pin', viewPin, 'public'],
  ['/', viewHome],
  ['/book/:id', viewBook],
  ['/reserve/:id', viewReserve],
  ['/mine', viewMine],
  ['/settings', viewSettings, 'user'],
  ['/admin', viewAdmin, 'admin'],
  ['/admin/:tab', viewAdmin, 'admin'],
];

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  for (const [pat, view, guard] of ROUTES) {
    const keys = [];
    const re = new RegExp('^' + pat.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$');
    const m = re.exec(path);
    if (m) return { path, view, guard, params: Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])), query: new URLSearchParams(qs || '') };
  }
  return { path: '/', view: viewHome, params: {}, query: new URLSearchParams() };
}
export const go = (p) => { location.hash = p; };

let renderId = 0;
async function render(opts) {
  const id = ++renderId;
  const r = parseHash();
  if (!opts?.soft) closeAllModals();
  if (!S.boot.setupDone && r.path !== '/setup') return go('/setup');
  if (S.boot.setupDone && r.path === '/setup') return go('/');
  if (r.guard !== 'public') {
    if (!S.user && !S.isAdmin) {
      if (r.path !== '/') sessionStorage.setItem('ledger.next', r.path);
      return go('/login');
    }
    if (r.guard === 'user' && !S.user) return go('/login');
  }
  if (r.guard === 'public') {
    $app.replaceChildren(h('div', { class: 'auth view-enter' }, await r.view(r)));
    return;
  }
  const main = h('main', { class: 'view-enter' }, h('div', { class: 'skeleton' }));
  $app.replaceChildren(shell(r, main));
  try {
    const content = await r.view(r);
    if (id !== renderId) return;
    main.replaceChildren(...[content].flat().filter(Boolean));
  } catch (e) {
    if (id !== renderId) return;
    main.replaceChildren(h('div', { class: 'glass panel empty' }, icon('x'), h('p', null, e.message)));
  }
}
window.addEventListener('hashchange', () => render());

async function refreshSession() {
  S.boot = await api('/api/bootstrap');
  S.user = S.boot.user;
  S.isAdmin = S.boot.isAdmin;
  document.title = S.boot.orgName ? `สมุดคุมเลข · ${S.boot.orgName}` : 'สมุดคุมเลขสารบรรณ';
  applyLook();
}

async function loadBooks() {
  S.books = await api('/api/books');
  return S.books;
}
async function loadBadges() {
  if (!S.user && !S.isAdmin) return;
  try { S.badges = await api('/api/badges'); } catch { return; }
  paintBadges();
}
function paintBadges() {
  document.querySelectorAll('[data-badge]').forEach((el) => {
    const k = el.dataset.badge;
    const n = k.startsWith('book:') ? S.badges.perBook?.[k.slice(5)] || 0 : S.badges[k] || 0;
    el.querySelector('.dot')?.remove();
    if (n > 0) el.append(h('i', { class: 'dot pulse', title: `${n} รายการ` }));
  });
}
setInterval(loadBadges, 60_000);

// ======================================================================
// โครงหน้า (dock + mobile bar)
// ======================================================================
function navLink(href, ic, label, cur, badge) {
  const p = href.slice(1);
  const on = href === '#/' ? cur === '/' : cur === p || cur.startsWith(p + '/');
  return h('a', { href, class: on ? 'on' : '', 'data-badge': badge }, typeof ic === 'string' ? icon(ic) : ic, h('span', { class: 'label' }, label));
}

function shell(r, main) {
  const cur = r.path;
  const openBooks = S.books.filter((b) => b.status === 'open');
  const dock = h('aside', { class: 'dock glass' },
    h('div', { class: 'brand' }, h('div', { class: 'brand-mark' }), h('div', null, h('b', null, 'สมุดคุมเลข'), h('small', null, S.boot.orgName || 'งานสารบรรณ'))),
    h('nav', { class: 'nav' },
      navLink('#/', 'home', 'หน้าหลัก', cur),
      S.user ? navLink('#/mine', 'bookmark', 'เลขที่ฉันจองไว้', cur, 'mine') : null,
      h('div', { class: 'nav-sec' }, 'สมุดทะเบียน'),
      openBooks.map((b) => navLink(`#/book/${b.id}`, h('i', { class: 'book-dot', style: { background: b.color } }), b.name, cur, `book:${b.id}`)),
      h('div', { class: 'nav-sec' }, 'ระบบ'),
      S.user ? navLink('#/settings', 'palette', 'ธีม เสียง และบัญชี', cur) : null,
      navLink('#/admin', S.isAdmin ? 'unlock' : 'shield', S.isAdmin ? 'ผู้ดูแลระบบ' : 'ผู้ดูแลระบบ (PIN)', cur, S.isAdmin ? 'pendingMembers' : undefined),
    ),
    h('div', { class: 'dock-foot' },
      S.user
        ? h('div', { class: 'me' }, h('div', { class: 'avatar' }, (S.user.fullName || '?').trim().charAt(0)),
          h('div', null, h('b', null, S.user.fullName), h('small', null, S.user.position || S.user.username)),
          h('button', { class: 'btn ghost icon sm', title: 'ออกจากระบบ', onclick: logout }, icon('logout')))
        : h('a', { class: 'btn block', href: '#/login' }, icon('user'), 'เข้าสู่ระบบสมาชิก'),
    ),
  );
  const mobile = h('nav', { class: 'mobile-bar glass' },
    navLink('#/', 'home', 'หน้าหลัก', cur),
    S.user ? navLink('#/mine', 'bookmark', 'จองไว้', cur, 'mine') : null,
    openBooks[0] ? navLink(`#/book/${openBooks[0].id}`, 'book', 'สมุด', cur.startsWith('/book') ? cur : '', 'total') : null,
    S.user ? navLink('#/settings', 'palette', 'ตั้งค่า', cur) : null,
    navLink('#/admin', 'shield', 'แอดมิน', cur, S.isAdmin ? 'pendingMembers' : undefined),
  );
  queueMicrotask(paintBadges);
  return h('div', { class: 'shell' }, dock, main, mobile);
}

async function logout() {
  await api('/api/logout', { method: 'POST' });
  await refreshSession();
  go('/login');
}

// ======================================================================
// หน้าสาธารณะ: ตั้งค่าครั้งแรก / เข้าสู่ระบบ / สมัครสมาชิก / PIN
// ======================================================================
const brandBig = () => h('div', { class: 'brand', style: { padding: 0 } }, h('div', { class: 'brand-mark' }), h('div', null, h('b', null, 'สมุดคุมเลขสารบรรณ'), h('small', null, S.boot?.orgName || 'เลขรับ · เลขส่ง · คำร้องทั่วไป')));

function pinInput(name = 'pin', placeholder = '••••••') {
  return h('input', { class: 'input num', name, type: 'password', inputmode: 'numeric', autocomplete: 'off', pattern: '\\d{6,8}', maxlength: 8, minlength: 6, required: true, placeholder, style: { textAlign: 'center', fontSize: '22px', letterSpacing: '.4em' } });
}

function viewSetup() {
  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      await attempt(() => api('/api/setup', { method: 'POST', body: formData(form) }), 'ตั้งค่าระบบเรียบร้อย');
      sound.success();
      await refreshSession();
      go('/admin/members');
    },
  },
  field('ชื่อหน่วยงาน', h('input', { name: 'orgName', required: true, placeholder: 'เช่น โรงเรียน… / สำนักงาน…' }), { required: true }),
  field('ตั้ง PIN ผู้ดูแลระบบ (ตัวเลข 6–8 หลัก)', pinInput('pin'), { required: true }),
  field('ยืนยัน PIN', pinInput('pin2'), { required: true }),
  h('p', { class: 'hint', style: { margin: 0 } }, 'ระบบไม่มีบัญชีผู้ดูแลเริ่มต้น — ผู้ที่รู้ PIN นี้เท่านั้นที่อนุมัติสมาชิกและตั้งค่าระบบได้ กรุณาเก็บรักษา PIN ให้ดี'),
  h('button', { class: 'btn primary lg block' }, icon('sparkles'), 'เริ่มใช้งานระบบ'));
  return h('div', { class: 'auth-card glass spot' }, brandBig(), h('h1', null, 'ตั้งค่าครั้งแรก'), h('p', { class: 'lead' }, 'กำหนดหน่วยงานและ PIN ผู้ดูแลระบบ ระบบจะสร้างสมุดทะเบียนรับ ทะเบียนส่ง และสมุดคุมเลขรับคำร้องของปีนี้ให้อัตโนมัติ'), form);
}

function viewLogin() {
  if (S.user) { setTimeout(() => go('/')); return h('div'); }
  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      await attempt(() => api('/api/login', { method: 'POST', body: formData(form) }));
      sound.success();
      await refreshSession();
      await loadBooks();
      const next = sessionStorage.getItem('ledger.next');
      sessionStorage.removeItem('ledger.next');
      go(next || '/');
    },
  },
  field('ชื่อผู้ใช้', h('input', { name: 'username', required: true, autocomplete: 'username', autocapitalize: 'off' })),
  field('รหัสผ่าน', h('input', { name: 'password', type: 'password', required: true, autocomplete: 'current-password' })),
  h('button', { class: 'btn primary lg block' }, 'เข้าสู่ระบบ'));
  const next = sessionStorage.getItem('ledger.next');
  return h('div', { class: 'auth-card glass spot' }, brandBig(),
    h('h1', null, 'เข้าสู่ระบบ'),
    h('p', { class: 'lead' }, next?.startsWith('/reserve') ? 'เข้าสู่ระบบเพื่อจองเลขจากลิงก์แจ้งเตือน' : `${thaiDate(bkkNow().date, { day: true })}`),
    form,
    h('div', { class: 'auth-links' },
      h('a', { href: '#/register' }, 'สมัครสมาชิกใหม่'),
      h('a', { href: '#/pin' }, icon('shield', ''), ' ผู้ดูแลระบบ (PIN)')));
}

function viewRegister() {
  let done = false;
  const wrap = h('div', { class: 'auth-card glass spot wide' });
  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      const d = formData(form);
      if (d.password !== d.password2) return toast('รหัสผ่านยืนยันไม่ตรงกัน', 'err');
      await attempt(() => api('/api/register', { method: 'POST', body: d }));
      sound.success();
      done = true;
      wrap.replaceChildren(h('div', { style: { textAlign: 'center' } },
        h('div', { class: 'wait-illu' }, icon('clock')),
        h('h1', null, 'ส่งคำขอสมัครแล้ว'),
        h('p', { class: 'lead' }, 'กรุณารอผู้ดูแลระบบตรวจสอบและอนุมัติบัญชี เมื่อได้รับอนุมัติแล้วจึงจะเข้าสู่ระบบได้'),
        h('a', { class: 'btn primary', href: '#/login' }, 'กลับไปหน้าเข้าสู่ระบบ')));
    },
  },
  h('div', { class: 'grid2' },
    field('ชื่อ-นามสกุล', h('input', { name: 'fullName', required: true }), { required: true, wide: true }),
    field('ตำแหน่ง', h('input', { name: 'position', placeholder: 'เช่น เจ้าพนักงานธุรการ' })),
    field('กลุ่มงาน/ฝ่าย', h('input', { name: 'department' })),
    field('ชื่อผู้ใช้ (a-z, 0-9)', h('input', { name: 'username', required: true, pattern: '[A-Za-z0-9._\\-]{3,40}', autocapitalize: 'off' }), { required: true }),
    field('เบอร์โทร', h('input', { name: 'phone', inputmode: 'tel' })),
    field('รหัสผ่าน', h('input', { name: 'password', type: 'password', minlength: 6, required: true, autocomplete: 'new-password' }), { required: true }),
    field('ยืนยันรหัสผ่าน', h('input', { name: 'password2', type: 'password', minlength: 6, required: true, autocomplete: 'new-password' }), { required: true })),
  h('button', { class: 'btn primary lg block' }, 'ส่งคำขอสมัครสมาชิก'));
  wrap.append(brandBig(), h('h1', null, 'สมัครสมาชิก'), h('p', { class: 'lead' }, 'บัญชีใหม่ต้องได้รับการอนุมัติจากผู้ดูแลระบบก่อนจึงจะใช้งานได้'), form,
    h('div', { class: 'auth-links' }, h('a', { href: '#/login' }, '← มีบัญชีแล้ว เข้าสู่ระบบ')));
  return wrap;
}

function pinForm(after) {
  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      await attempt(() => api('/api/admin/unlock', { method: 'POST', body: formData(form) }), 'ปลดล็อกผู้ดูแลระบบแล้ว (30 นาที)');
      sound.success();
      await refreshSession();
      await loadBooks().catch(() => {});
      after();
    },
  }, field('PIN ผู้ดูแลระบบ', pinInput()), h('button', { class: 'btn primary lg block' }, icon('unlock'), 'ปลดล็อก'));
  return form;
}

function viewPin() {
  return h('div', { class: 'auth-card glass spot' }, brandBig(),
    h('h1', null, 'ผู้ดูแลระบบ'), h('p', { class: 'lead' }, 'ใส่ PIN เพื่ออนุมัติสมาชิกและตั้งค่าระบบ'),
    pinForm(() => { location.hash === '#/admin/members' ? render() : go('/admin/members'); }),
    h('div', { class: 'auth-links' }, h('a', { href: '#/login' }, '← กลับไปหน้าเข้าสู่ระบบ')));
}

// ======================================================================
// หน้าหลัก
// ======================================================================
function greeting() {
  const t = +bkkNow().time.slice(0, 2);
  return t < 12 ? 'อรุณสวัสดิ์' : t < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น';
}

function festivalPill() {
  const fest = activeFestival(bkkNow().date);
  if (!fest) {
    const next = upcomingFestivals(bkkNow().date, 1)[0];
    return next ? h('div', { class: 'fest-pill' }, h('span', { class: 'e' }, next.emoji), `เทศกาลถัดไป: ${next.name} ${thaiDate(next.start, { short: true })}`) : null;
  }
  return h('div', { class: 'fest-pill' }, h('span', { class: 'e' }, fest.emoji), fest.ongoing ? `สุขสันต์${fest.name}` : `อีก ${fest.daysLeft} วัน ถึง${fest.name}`);
}

function liveClock() {
  const t = h('div', { class: 't' });
  const d = h('small', { class: 'hint' });
  const tick = () => { const n = bkkNow(); t.textContent = `${n.time}:${n.seconds}`; d.textContent = thaiDate(n.date, { day: true }); };
  tick();
  const iv = setInterval(() => { if (!t.isConnected) return clearInterval(iv); tick(); }, 1000);
  return h('div', { class: 'clock' }, t, d);
}

function bookCard(b) {
  const T = BOOK_TYPES[b.type];
  const pending = S.badges.perBook?.[b.id] || b.pending;
  const lastNo = b.last_no >= b.start_no ? b.last_no : null;
  return h('article', { class: `book glass spot${b.status === 'closed' ? ' closed' : ''}`, style: { '--c': b.color } },
    h('i', { class: 'stitch' }),
    pending ? h('span', { class: 'corner-dot', 'data-badge': `book:${b.id}` }) : null,
    h('div', { class: 'book-head' },
      h('div', null,
        h('div', { class: 'book-type' }, icon(T.icon), T.label, b.status === 'closed' ? ' · ปิดเล่มแล้ว' : ''),
        h('h3', null, h('a', { href: `#/book/${b.id}`, style: { color: 'inherit' } }, b.name)))),
    h('div', { class: 'bignum' },
      h('span', { class: 'n' }, b.nextNo),
      h('div', { class: 'lbl' }, 'เลขถัดไป', h('br'), 'ล่าสุด ', h('b', { class: 'num' }, lastNo ?? '—'),
        b.type === 'send' && b.prefix ? [h('br'), `ที่ ${b.prefix}${b.nextNo}`] : null)),
    h('div', { class: 'book-stats' },
      h('span', { class: 'chip' }, icon('calendar'), `วันนี้ ${b.todayCount}`),
      h('span', { class: 'chip' }, icon('book'), `ทั้งหมด ${b.total}`),
      pending ? h('span', { class: 'chip red' }, `จองค้าง ${pending}`) : null,
      b.unsigned ? h('span', { class: 'chip amber' }, icon('signature'), `รอเซ็นรับ ${b.unsigned}`) : null,
      b.yearMismatch ? h('span', { class: 'chip amber', title: 'ขึ้นปีใหม่แล้ว ผู้ดูแลควรเปิดเล่มใหม่' }, `เล่มปี ${b.year}`) : null),
    b.status === 'open' && S.user
      ? h('div', { class: 'book-actions' },
        h('button', { class: 'btn primary', onclick: () => issueModal(b) }, icon('zap'), 'ออกเลขทันที'),
        h('button', { class: 'btn', onclick: () => reserveModal(b) }, icon('bookmark'), 'จองเลข'))
      : h('div', { class: 'book-actions' }, h('a', { class: 'btn', href: `#/book/${b.id}`, style: { gridColumn: '1/-1' } }, icon('eye'), 'เปิดสมุด')));
}

async function viewHome() {
  await Promise.all([loadBooks(), loadBadges()]);
  const open = S.books.filter((b) => b.status === 'open');
  const closed = S.books.filter((b) => b.status !== 'open');
  const mine = S.user ? await api('/api/reservations/mine') : [];
  const name = S.user ? S.user.fullName.split(/\s+/)[0] : 'ผู้ดูแลระบบ';
  return [
    h('section', { class: 'hello glass spot' },
      h('div', null, h('h1', null, `${greeting()}, ${name}`),
        h('p', null, S.user ? 'เลือกสมุดเพื่อออกเลขทันที หรือจองเลขไว้ก่อนแล้วค่อยกรอกรายละเอียดภายหลัง' : 'คุณอยู่ในโหมดผู้ดูแลระบบ (ไม่มีบัญชีสมาชิก) — ดูสมุดได้ แต่การออกเลขต้องเข้าสู่ระบบสมาชิก'),
        festivalPill()),
      liveClock()),
    mine.length ? h('section', { class: 'glass panel', style: { marginBottom: '22px' } },
      h('h2', null, icon('bookmark'), 'เลขที่คุณจองไว้ ยังไม่ลงรายละเอียด', h('span', { class: 'dot count' }, mine.length)),
      h('div', { class: 'list' }, mine.slice(0, 5).map((e) => reservationItem(e))),
      mine.length > 5 ? h('a', { href: '#/mine', class: 'btn sm ghost', style: { marginTop: '10px' } }, `ดูทั้งหมด ${mine.length} รายการ`) : null) : null,
    open.length ? h('section', { class: 'books' }, open.map(bookCard)) : h('div', { class: 'glass panel empty' }, icon('book'), h('p', null, 'ยังไม่มีสมุดที่เปิดใช้งาน — ผู้ดูแลระบบสร้างได้ที่เมนูผู้ดูแลระบบ')),
    closed.length ? h('details', { style: { marginTop: '26px' } },
      h('summary', { class: 'sec-title', style: { cursor: 'pointer' } }, `สมุดที่ปิดเล่มแล้ว (${closed.length})`),
      h('section', { class: 'books' }, closed.map(bookCard))) : null,
  ];
}

function reservationItem(e) {
  return h('div', { class: 'list-item' },
    h('span', { class: 'dot', style: { position: 'static' } }),
    h('div', { class: 'grow' }, h('b', null, `${BOOK_TYPES[e.book_type].short} ${displayNo({ type: e.book_type, year: e.book_year }, e.no)}`, e.doc_ref ? ` · ที่ ${e.doc_ref}` : ''),
      h('small', null, `${e.book_name} · จองเมื่อ ${thaiDate(e.entry_date, { short: true })} ${e.entry_time || ''} · ผู้จอง ${e.reserved_name}`, e.subject ? ` · ${e.subject}` : '')),
    h('button', { class: 'btn primary sm', onclick: async () => fillModal(await api(`/api/entries/${e.id}`)) }, icon('edit'), 'ลงรายละเอียด'));
}

async function viewMine() {
  if (!S.user) return h('div', { class: 'glass panel empty' }, 'ต้องเข้าสู่ระบบสมาชิก');
  const rows = await api('/api/reservations/mine');
  return [
    h('div', { class: 'topbar' }, h('div', null, h('h1', null, 'เลขที่ฉันจองไว้'), h('div', { class: 'sub' }, 'เลขเหล่านี้ล็อกไว้ตามวันที่จองแล้ว กรอกรายละเอียดเมื่อพร้อม (ไม่นับเป็นการแก้ไข)'))),
    rows.length ? h('div', { class: 'list' }, rows.map(reservationItem))
      : h('div', { class: 'glass panel empty' }, icon('check'), h('p', null, 'ไม่มีเลขที่จองค้างไว้ เยี่ยมมาก!')),
  ];
}

// ======================================================================
// ฟอร์มออกเลข / จองเลข / ลงรายละเอียด
// ======================================================================
function entryFields(type, values = {}) {
  return BOOK_TYPES[type].fields.map((f) => {
    const v = values[f.key] ?? '';
    const input = f.wide && f.key !== 'subject'
      ? h('textarea', { name: f.key, rows: 2, placeholder: f.placeholder || '' }, v)
      : h('input', { name: f.key, type: f.type || 'text', value: v, placeholder: f.placeholder || '', required: !!f.required });
    return field(f.label, input, { required: f.required, wide: f.wide });
  });
}

function ticket(b, entries, title) {
  const first = entries[0], last = entries[entries.length - 1];
  const range = entries.length > 1 ? `${displayNo(b, first.no)} – ${displayNo(b, last.no)}` : displayNo(b, first.no);
  return h('div', { class: 'big-ticket' },
    h('small', null, title),
    h('b', { class: 'stamp' }, range),
    b.type === 'send' ? h('div', { class: 'ref' }, `ที่ ${first.doc_ref}${entries.length > 1 ? ` – ${last.doc_ref}` : ''}`) : null,
    h('small', null, `${BOOK_TYPES[b.type].dateLabel} ${thaiDate(first.entry_date)} เวลา ${first.entry_time} น.`));
}

function copyBtn(text) {
  return h('button', { class: 'btn', onclick: () => navigator.clipboard?.writeText(text).then(() => toast('คัดลอกแล้ว')) }, 'คัดลอกเลข');
}

function issueModal(b) {
  const T = BOOK_TYPES[b.type];
  openModal(({ el, close }) => {
    const form = h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type=submit]');
        btn.disabled = true;
        try {
          const entry = await attempt(() => api(`/api/books/${b.id}/issue`, { method: 'POST', body: formData(form) }));
          sound.success();
          el.replaceChildren(
            modalHead('ออกเลขสำเร็จ', b.name, close),
            ticket(b, [entry], T.noLabel),
            h('div', { class: 'modal-foot' },
              copyBtn(b.type === 'send' ? entry.doc_ref : displayNo(b, entry.no)),
              T.canSign ? h('button', { class: 'btn', onclick: () => { close(); signModal(entry); } }, icon('signature'), 'เซ็นรับเลย') : null,
              h('button', { class: 'btn primary', onclick: close }, 'เรียบร้อย')));
          afterChange();
        } catch { btn.disabled = false; }
      },
    },
    h('div', { class: 'grid2' }, entryFields(b.type)),
    h('div', { class: 'modal-foot' },
      h('button', { type: 'button', class: 'btn ghost', onclick: close }, 'ยกเลิก'),
      h('button', { type: 'submit', class: 'btn primary' }, icon('zap'), 'ออกเลข')));
    return [modalHead(`ออกเลขทันที · ${T.label}`, `${b.name} — เลขถัดไปคือ ${displayNo(b, b.nextNo)} (ระบบจะยืนยันเลขจริงเมื่อบันทึก)`, close), form];
  }, { size: 'wide' });
}

function reserveModal(b, { onDone } = {}) {
  const T = BOOK_TYPES[b.type];
  openModal(({ el, close }) => {
    const count = h('input', { name: 'count', type: 'number', min: 1, max: 20, value: 1, class: 'num', style: { textAlign: 'center' } });
    const form = h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type=submit]');
        btn.disabled = true;
        try {
          const entries = await attempt(() => api(`/api/books/${b.id}/reserve`, { method: 'POST', body: formData(form) }));
          sound.success();
          el.replaceChildren(
            modalHead('จองเลขสำเร็จ', `${b.name} · ผู้จอง ${entries[0].reserved_name}`, close),
            ticket(b, entries, `จอง${T.short}ไว้แล้ว`),
            h('p', { class: 'hint', style: { textAlign: 'center' } }, 'เลขนี้ถูกล็อกตามวันที่จองแล้ว เข้ามากรอกรายละเอียดภายหลังได้ที่ "เลขที่ฉันจองไว้" (ไม่นับเป็นการแก้ไข)'),
            h('div', { class: 'modal-foot' },
              copyBtn(b.type === 'send' ? entries.map((x) => x.doc_ref).join(', ') : entries.map((x) => displayNo(b, x.no)).join(', ')),
              h('button', { class: 'btn', onclick: async () => { close(); fillModal(await api(`/api/entries/${entries[0].id}`)); } }, icon('edit'), 'กรอกรายละเอียดเลย'),
              h('button', { class: 'btn primary', onclick: close }, 'เรียบร้อย')));
          afterChange();
          onDone?.(entries);
        } catch { btn.disabled = false; }
      },
    },
    h('div', { class: 'grid2' },
      field('ลงชื่อผู้จอง', h('input', { name: 'reservedName', value: S.user.fullName, required: true }), { required: true }),
      field('จำนวนเลขที่ต้องการจอง', h('div', { style: { display: 'flex', gap: '8px' } },
        h('button', { type: 'button', class: 'btn icon', onclick: () => { count.value = Math.max(1, +count.value - 1); } }, '−'),
        count,
        h('button', { type: 'button', class: 'btn icon', onclick: () => { count.value = Math.min(20, +count.value + 1); } }, '+'))),
      field('เรื่องโดยย่อ (ไม่บังคับ)', h('input', { name: 'subject', placeholder: 'ช่วยจำว่าจองไว้สำหรับเรื่องอะไร' }), { wide: true })),
    h('p', { class: 'hint' }, `เลขจะถูกล็อกเป็นเลขล่าสุด ณ วันที่จอง (${thaiDate(bkkNow().date)}) แล้วค่อยกรอกรายละเอียดภายหลัง`),
    h('div', { class: 'modal-foot' },
      h('button', { type: 'button', class: 'btn ghost', onclick: close }, 'ยกเลิก'),
      h('button', { type: 'submit', class: 'btn primary' }, icon('bookmark'), 'จองเลข')));
    return [modalHead(`จองเลข · ${T.label}`, `${b.name} — เลขถัดไปคือ ${displayNo(b, b.nextNo)}`, close), form];
  }, { size: '' });
}

function fillModal(e) {
  const b = e.book;
  const T = BOOK_TYPES[b.type];
  const isFill = e.status === 'reserved';
  openModal(({ close }) => {
    const form = h('form', {
      onsubmit: async (ev) => {
        ev.preventDefault();
        const btn = form.querySelector('button[type=submit]');
        btn.disabled = true;
        try {
          await attempt(() => api(`/api/entries/${e.id}`, { method: 'PUT', body: formData(form) }), isFill ? 'ลงรายละเอียดเรียบร้อย' : 'บันทึกการแก้ไขแล้ว');
          sound.success();
          close();
          afterChange();
        } catch { btn.disabled = false; }
      },
    },
    h('div', { class: 'grid2' }, entryFields(b.type, e)),
    h('p', { class: 'hint' }, isFill
      ? `เลขนี้จองไว้เมื่อ ${thaiDate(e.entry_date)} ${e.entry_time} น. โดย ${e.reserved_name} — การกรอกครั้งนี้ไม่นับเป็นการแก้ไข และคงวันที่จองไว้`
      : `การแก้ไขจะถูกบันทึกในประวัติ (แก้ไขแล้ว ${e.edit_count} ครั้ง)`),
    h('div', { class: 'modal-foot' },
      h('button', { type: 'button', class: 'btn ghost', onclick: close }, 'ยกเลิก'),
      h('button', { type: 'submit', class: 'btn primary' }, icon('check'), isFill ? 'บันทึกรายละเอียด' : 'บันทึกการแก้ไข')));
    return [modalHead(`${isFill ? 'ลงรายละเอียด' : 'แก้ไข'} ${T.noLabel} ${displayNo(b, e.no)}`, `${b.name}${e.doc_ref && b.type === 'send' ? ` · ที่ ${e.doc_ref}` : ''}`, close), form];
  }, { size: 'wide' });
}

function signModal(entry) {
  let pad;
  const inks = ['#1a3a8f', '#0b0b0b', '#0d6b4f'];
  openModal(({ close }) => {
    const canvas = h('canvas');
    const ph = h('div', { class: 'ph' }, 'เซ็นชื่อที่นี่ด้วยนิ้ว ปากกา หรือเมาส์');
    const wrap = h('div', { class: 'sigpad-wrap' }, canvas, h('div', { class: 'baseline' }), h('span', { class: 'x' }, '✕'), ph);
    const inkBtns = inks.map((c, i) => h('button', { type: 'button', class: `ink${i === 0 ? ' on' : ''}`, style: { background: c }, title: 'สีหมึก', onclick: (ev) => { pad.setColor(c); wrap.parentElement.querySelectorAll('.ink').forEach((x) => x.classList.remove('on')); ev.currentTarget.classList.add('on'); } }));
    const form = h('form', {
      onsubmit: async (ev) => {
        ev.preventDefault();
        if (pad.isEmpty()) return toast('กรุณาเซ็นชื่อในช่องลายมือชื่อ', 'err');
        const d = formData(form);
        await attempt(() => api(`/api/entries/${entry.id}/sign`, { method: 'POST', body: { ...d, image: pad.toPNG() } }), 'บันทึกลายมือชื่อรับหนังสือแล้ว');
        sound.success();
        close();
        afterChange();
      },
    },
    h('div', { class: 'grid2' },
      field('ชื่อผู้รับหนังสือ', h('input', { name: 'name', value: S.user?.fullName || '', required: true }), { required: true }),
      field('ตำแหน่ง', h('input', { name: 'position', value: S.user?.position || '' }))),
    h('div', { style: { marginTop: '14px' } }, wrap),
    h('div', { class: 'sigpad-tools' },
      h('div', { class: 'inks' }, h('span', { class: 'hint' }, 'หมึก'), inkBtns),
      h('div', { style: { display: 'flex', gap: '8px' } },
        h('button', { type: 'button', class: 'btn sm', onclick: () => pad.undo() }, icon('undo'), 'ย้อน'),
        h('button', { type: 'button', class: 'btn sm', onclick: () => pad.clear() }, icon('trash'), 'ล้าง'))),
    h('div', { class: 'modal-foot' },
      h('button', { type: 'button', class: 'btn ghost', onclick: close }, 'ยกเลิก'),
      h('button', { type: 'submit', class: 'btn primary' }, icon('signature'), 'ยืนยันการรับหนังสือ')));
    setTimeout(() => { pad = new SignaturePad(canvas, { color: inks[0], onChange: (p) => { ph.style.opacity = p.strokes.length ? 0 : 1; } }); });
    return [modalHead('เซ็นรับหนังสือ', `เลขรับ ${entry.no} · ${entry.subject || ''}`, close), form];
  }, { size: 'wide', onClose: () => pad?.destroy() });
}

let afterChangeHook = null;
function afterChange() {
  loadBadges();
  if (afterChangeHook) afterChangeHook();
  else if (parseHash().path === '/' || parseHash().path === '/mine') render({ soft: true });
}

// ======================================================================
// รายละเอียดรายการ (drawer)
// ======================================================================
const ACTION_LABEL = { issue: 'ออกเลขทันที', reserve: 'จองเลข', fill: 'ลงรายละเอียด (ไม่นับเป็นการแก้ไข)', edit: 'แก้ไขรายละเอียด', cancel: 'ยกเลิกเลข', sign: 'เซ็นรับหนังสือ', unsign: 'ลบลายเซ็น' };

async function openEntry(id) {
  const e = await api(`/api/entries/${id}`);
  const b = e.book;
  const T = BOOK_TYPES[b.type];
  openModal(({ close }) => {
    const statusChip = h('span', { class: `chip ${e.status === 'reserved' ? 'red' : e.status === 'cancelled' ? '' : 'green'}` }, STATUS_LABEL[e.status]);
    const kv = h('dl', { class: 'kv' },
      h('dt', null, T.dateLabel), h('dd', null, `${thaiDate(e.entry_date)} เวลา ${e.entry_time || '-'} น.`),
      b.type === 'send' ? [h('dt', null, 'ที่'), h('dd', null, e.doc_ref || '-')] : null,
      T.fields.map((f) => [h('dt', null, f.label), h('dd', null, (f.type === 'date' ? thaiDate(e[f.key]) : e[f.key]) || '—')]),
      h('dt', null, e.mode === 'reserve' ? 'ผู้จอง' : 'ผู้ออกเลข'), h('dd', null, e.reserved_name || '-'),
      h('dt', null, 'การแก้ไข'), h('dd', null, e.edit_count ? `${e.edit_count} ครั้ง` : 'ไม่มีการแก้ไข'),
      e.cancel_reason ? [h('dt', null, 'เหตุผลยกเลิก'), h('dd', { style: { color: 'var(--danger)' } }, e.cancel_reason)] : null);
    const sigs = T.canSign ? [
      h('div', { class: 'sec-title' }, icon('signature'), `ลายมือชื่อผู้รับหนังสือ (${e.signatures.length})`),
      e.signatures.length ? h('div', { class: 'sig-list' }, e.signatures.map((s) => h('div', { class: 'sig-card' },
        h('img', { src: s.image, alt: `ลายเซ็น ${s.name}` }), h('b', null, s.name), h('small', null, s.position || ''), h('small', null, thaiDateTime(s.signed_at, { short: true })),
        S.isAdmin ? h('button', { class: 'btn ghost sm danger', onclick: async () => { if (await confirmBox('ลบลายเซ็น', `ลบลายเซ็นของ ${s.name}?`, { danger: true, ok: 'ลบ' })) { await attempt(() => api(`/api/signatures/${s.id}`, { method: 'DELETE' }), 'ลบแล้ว'); close(); afterChange(); } } }, icon('trash')) : null)))
        : h('p', { class: 'hint' }, e.status === 'filled' ? 'ยังไม่มีผู้เซ็นรับ' : 'ลงรายละเอียดก่อนจึงจะเซ็นรับได้'),
      e.status === 'filled' && S.user ? h('button', { class: 'btn', style: { marginTop: '10px' }, onclick: () => { close(); signModal(e); } }, icon('signature'), 'เซ็นรับหนังสือ') : null,
    ] : null;
    const logs = [h('div', { class: 'sec-title' }, icon('clock'), 'ประวัติรายการ'),
      h('ul', { class: 'timeline' }, e.logs.map((l) => h('li', { class: l.action },
        h('b', null, ACTION_LABEL[l.action] || l.action), ` · ${l.actor || ''}`,
        h('small', null, thaiDateTime(l.at, { short: true })),
        l.action === 'edit' && l.detail ? h('div', { class: 'diff' }, Object.entries(l.detail).map(([k, [a, bb]]) => h('div', null, `${COLUMN_LABELS[k] || k}: `, h('del', null, a || '∅'), ' → ', h('ins', null, bb || '∅')))) : null,
        l.action === 'cancel' && l.detail ? h('div', { class: 'diff' }, l.detail.reason) : null)))];
    const actions = h('div', { class: 'modal-foot', style: { justifyContent: 'flex-start' } },
      e.canEdit ? h('button', { class: 'btn primary', onclick: () => { close(); fillModal(e); } }, icon('edit'), e.status === 'reserved' ? 'ลงรายละเอียด' : 'แก้ไข') : null,
      e.canEdit && (e.status === 'reserved' || S.isAdmin) ? h('button', { class: 'btn danger', onclick: async () => {
        const reason = await confirmBox('ยกเลิกเลขนี้', 'ตามหลักงานสารบรรณ เลขที่ยกเลิกจะไม่ถูกนำกลับมาใช้ซ้ำ และจะแสดงในทะเบียนว่า "ยกเลิก"', { danger: true, ok: 'ยกเลิกเลข', input: 'ระบุเหตุผล' });
        if (reason === false) return;
        await attempt(() => api(`/api/entries/${e.id}/cancel`, { method: 'POST', body: { reason } }), 'ยกเลิกเลขแล้ว');
        close(); afterChange();
      } }, icon('x'), 'ยกเลิกเลข') : null);
    return [
      h('div', { class: 'modal-head' },
        h('div', null, h('div', { class: 'book-type', style: { '--c': b.color, color: b.color } }, icon(T.icon), b.name),
          h('h2', { style: { fontSize: '34px', margin: '6px 0' } }, `${T.noLabel} ${displayNo(b, e.no)}`), statusChip),
        h('button', { class: 'btn ghost icon', onclick: close }, icon('x'))),
      kv, sigs, actions, logs,
    ];
  }, { drawer: true });
}

// ======================================================================
// หน้าสมุดทะเบียน
// ======================================================================
async function viewBook(r) {
  const id = r.params.id;
  const st = { status: r.query.get('status') || '', q: '', month: '', page: 0, unsigned: false };
  const book = await api(`/api/books/${id}`);
  if (!S.books.length) await loadBooks();
  const T = BOOK_TYPES[book.type];
  const tableBox = h('div', { class: 'table-wrap glass' });
  const headBox = h('div');

  const cols = [
    ['no', T.noLabel],
    ...(book.type === 'send' ? [['doc_ref', 'ที่']] : []),
    ['entry_date', T.dateLabel],
    ...T.fields.filter((f) => !['note'].includes(f.key)).map((f) => [f.key, f.label]),
    ...(T.canSign ? [['sign', 'ผู้รับหนังสือ']] : []),
    ['note', 'หมายเหตุ'],
  ];

  function header(b) {
    return h('section', { class: 'ledger-head glass spot' },
      h('div', { class: 'ledger-cover', style: { '--c': b.color } }, icon(T.icon)),
      h('div', { class: 'info' },
        h('div', { class: 'book-type', style: { color: b.color } }, T.label, b.status === 'closed' ? ' · ปิดเล่มแล้ว' : ''),
        h('h1', null, b.name),
        h('div', { class: 'meta' },
          h('span', { class: 'chip' }, `ทั้งหมด ${b.total} รายการ`),
          h('span', { class: 'chip' }, `วันนี้ ${b.todayCount}`),
          b.pending ? h('span', { class: 'chip red' }, `จองค้าง ${b.pending}`) : null,
          b.unsigned ? h('span', { class: 'chip amber' }, `รอเซ็นรับ ${b.unsigned}`) : null,
          b.type === 'send' && b.prefix ? h('span', { class: 'chip blue' }, `รหัส ${b.prefix}`) : null)),
      h('div', { class: 'next-box' }, h('small', null, 'เลขถัดไป'), h('b', null, displayNo(b, b.nextNo))),
      b.status === 'open' && S.user ? h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } },
        h('button', { class: 'btn primary', onclick: () => issueModal(b) }, icon('zap'), 'ออกเลขทันที'),
        h('button', { class: 'btn', onclick: () => reserveModal(b) }, icon('bookmark'), 'จองเลข')) : null);
  }

  const seg = h('div', { class: 'seg' });
  const segItems = [['', 'ทั้งหมด'], ['reserved', 'จองค้าง'], ['filled', 'บันทึกแล้ว'], ...(T.canSign ? [['unsigned', 'รอเซ็นรับ']] : []), ['cancelled', 'ยกเลิก']];
  const paintSeg = () => seg.replaceChildren(...segItems.map(([k, l]) => h('button', {
    class: (k === 'unsigned' ? st.unsigned : !st.unsigned && st.status === k) ? 'on' : '',
    onclick: () => { st.unsigned = k === 'unsigned'; st.status = k === 'unsigned' ? '' : k; st.page = 0; paintSeg(); load(); },
  }, l, k === 'reserved' && S.badges.perBook?.[id] ? h('i', { class: 'dot', style: { position: 'static' } }) : null)));
  paintSeg();

  const now = bkkNow();
  const monthSel = h('select', { class: 'input', style: { width: 'auto' }, onchange: (e) => { st.month = e.target.value; st.page = 0; load(); } },
    h('option', { value: '' }, 'ทุกเดือน'),
    Array.from({ length: 12 }, (_, i) => {
      const y = book.year - 543;
      const v = `${y}-${String(i + 1).padStart(2, '0')}`;
      return h('option', { value: v }, `${TH_MONTHS[i]} ${book.year}`);
    }));
  let qTimer;
  const search = h('label', { class: 'search' }, icon('search'), h('input', { class: 'input', placeholder: 'ค้นหาเลข เรื่อง ผู้ส่ง ผู้รับ…', oninput: (e) => { clearTimeout(qTimer); qTimer = setTimeout(() => { st.q = e.target.value; st.page = 0; load(); }, 280); } }));

  function cell(e, key) {
    if (key === 'no') return h('td', { class: 'no' }, displayNo(book, e.no));
    if (key === 'entry_date') return h('td', { class: 'dim' }, thaiDate(e.entry_date, { short: true }), h('br'), h('small', null, e.entry_time || ''));
    if (key === 'doc_date') return h('td', { class: 'dim' }, thaiDate(e.doc_date, { short: true }));
    if (key === 'doc_ref') return h('td', { class: 'dim' }, e.doc_ref || '');
    if (key === 'sign') return h('td', null, e.sign_count ? h('span', { class: 'chip green' }, icon('check'), `${e.sign_count} คน`) : e.status === 'filled' ? h('span', { class: 'chip amber' }, 'รอเซ็น') : '');
    if (key === 'subject' && e.status === 'reserved') {
      return h('td', { class: 'subject' }, h('span', { class: 'res-tag' }, h('i', { class: 'dot pulse' }), 'จองไว้ · รอลงรายละเอียด'),
        h('div', { class: 'hint' }, `ผู้จอง ${e.reserved_name}${e.subject ? ` · ${e.subject}` : ''}`));
    }
    if (key === 'note' && e.status === 'cancelled') return h('td', null, h('span', { class: 'chip red' }, 'ยกเลิก'), ' ', e.cancel_reason || '');
    if (key === 'note' && e.edit_count) return h('td', null, e.note || '', ' ', h('span', { class: 'chip', title: 'จำนวนครั้งที่แก้ไข' }, `แก้ไข ${e.edit_count}`));
    return h('td', { class: key === 'subject' ? 'subject' : '' }, e[key] || '');
  }

  let lastData = null;
  async function load() {
    const qs = new URLSearchParams({ page: st.page, limit: 100 });
    if (st.status) qs.set('status', st.status);
    if (st.unsigned) qs.set('unsigned', '1');
    if (st.q) qs.set('q', st.q);
    if (st.month) qs.set('month', st.month);
    const data = await api(`/api/books/${id}/entries?${qs}`);
    lastData = data;
    headBox.replaceChildren(header(data.book));
    if (!data.rows.length) {
      tableBox.replaceChildren(h('div', { class: 'empty' }, icon('book'), h('p', null, st.q || st.status || st.month ? 'ไม่พบรายการตามเงื่อนไข' : 'ยังไม่มีการออกเลขในสมุดเล่มนี้')));
      return;
    }
    const pages = Math.ceil(data.total / data.limit);
    tableBox.replaceChildren(...[
      h('table', { class: 'ledger' },
        h('thead', null, h('tr', null, cols.map(([, l]) => h('th', null, l)))),
        h('tbody', null, data.rows.map((e) => h('tr', { class: e.status, 'data-id': e.id, onclick: () => openEntry(e.id) }, cols.map(([k]) => cell(e, k)))))),
      pages > 1 ? h('div', { class: 'pager' },
        h('button', { class: 'btn sm', disabled: st.page === 0, onclick: () => { st.page--; load(); } }, '‹ ก่อนหน้า'),
        `หน้า ${st.page + 1} / ${pages} · ${data.total} รายการ`,
        h('button', { class: 'btn sm', disabled: st.page >= pages - 1, onclick: () => { st.page++; load(); } }, 'ถัดไป ›')) : null].filter(Boolean));
  }
  afterChangeHook = () => { if (parseHash().path === `/book/${id}`) load(); else afterChangeHook = null; };
  await load();

  return [
    headBox,
    h('div', { class: 'toolbar' },
      seg,
      h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', flex: '1', justifyContent: 'flex-end' } },
        search, monthSel,
        h('button', { class: 'btn icon', title: 'พิมพ์ทะเบียน', onclick: () => printLedger(book, st) }, icon('printer')),
        h('a', { class: 'btn icon', title: 'ส่งออก CSV (Excel)', href: `/api/books/${id}/export.csv` }, icon('download')))),
    tableBox,
  ];
}

window.addEventListener('hashchange', () => { if (!parseHash().path.startsWith('/book/')) afterChangeHook = null; });

async function printLedger(book, st) {
  const T = BOOK_TYPES[book.type];
  const qs = new URLSearchParams({ limit: 500, order: 'asc' });
  if (st.month) qs.set('month', st.month);
  if (st.status) qs.set('status', st.status);
  const data = await api(`/api/books/${book.id}/entries?${qs}`);
  let sigs = {};
  if (T.canSign) {
    const details = await Promise.all(data.rows.filter((r) => r.sign_count).map((r) => api(`/api/entries/${r.id}`)));
    sigs = Object.fromEntries(details.map((d) => [d.id, d.signatures]));
  }
  const pc = [[T.noLabel, (e) => displayNo(book, e.no), 'c'], ...(book.type === 'send' ? [['ที่', (e) => e.doc_ref]] : []),
    [T.dateLabel, (e) => thaiDate(e.entry_date, { short: true }), 'c'],
    ...T.fields.filter((f) => f.key !== 'note').map((f) => [f.label, (e) => (f.type === 'date' ? thaiDate(e[f.key], { short: true }) : e[f.key])]),
    ...(T.canSign ? [['ลงชื่อผู้รับ', (e) => sigs[e.id]?.map((s) => `<img src="${s.image}"><div style="text-align:center;font-size:10pt">${esc(s.name)}</div>`).join('') || '', 'raw']] : []),
    ['หมายเหตุ', (e) => (e.status === 'cancelled' ? `ยกเลิก: ${e.cancel_reason || ''}` : e.status === 'reserved' ? `จองโดย ${e.reserved_name}` : e.note)]];
  const area = document.querySelector('.print-area') || document.body.appendChild(h('div', { class: 'print-area' }));
  area.innerHTML = `<h1>${esc(T.label)}</h1><div class="ph">${esc(S.boot.orgName || '')} · ${esc(book.name)}${st.month ? ` · ${TH_MONTHS[+st.month.slice(5) - 1]} ${book.year}` : ''}</div>
    <table><thead><tr>${pc.map((c) => `<th>${esc(c[0])}</th>`).join('')}</tr></thead><tbody>
    ${data.rows.map((e) => `<tr>${pc.map(([, f, m]) => `<td class="${m === 'c' ? 'c' : ''}">${m === 'raw' ? f(e) : esc(f(e) ?? '')}</td>`).join('')}</tr>`).join('')}
    </tbody></table>`;
  setTimeout(() => window.print(), 150);
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ======================================================================
// ลิงก์จองเลขจาก Telegram
// ======================================================================
async function viewReserve(r) {
  if (!S.user) {
    sessionStorage.setItem('ledger.next', r.path);
    return h('div', { class: 'glass panel empty' }, h('p', null, 'การจองเลขต้องเข้าสู่ระบบสมาชิก'), h('a', { class: 'btn primary', href: '#/login' }, 'เข้าสู่ระบบ'));
  }
  const b = await api(`/api/books/${r.params.id}`);
  const T = BOOK_TYPES[b.type];
  if (b.status !== 'open') return h('div', { class: 'glass panel empty' }, h('p', null, 'สมุดเล่มนี้ปิดแล้ว'));
  return h('div', { style: { maxWidth: '560px', margin: '6vh auto 0' } },
    h('section', { class: 'book glass spot', style: { '--c': b.color, padding: '30px 30px 26px 44px' } },
      h('i', { class: 'stitch' }),
      h('div', { class: 'book-type' }, icon(T.icon), `จองเลขจากการแจ้งเตือน · ${T.label}`),
      h('h3', null, b.name),
      h('div', { class: 'bignum' }, h('span', { class: 'n', style: { fontSize: '76px' } }, displayNo(b, b.nextNo)),
        h('div', { class: 'lbl' }, 'เลขล่าสุดที่จะจองให้', h('br'), `ณ ${thaiDate(bkkNow().date)}`)),
      h('p', { class: 'hint', style: { margin: 0 } }, 'เลขจริงจะยืนยันตอนกดจอง หากมีผู้อื่นจองก่อน ระบบจะให้เลขถัดไปโดยอัตโนมัติ'),
      h('div', { class: 'book-actions' },
        h('button', { class: 'btn primary lg', style: { gridColumn: '1/-1' }, onclick: () => reserveModal(b, { onDone: () => {} }) }, icon('bookmark'), 'จองเลขนี้'),
        h('a', { class: 'btn', href: `#/book/${b.id}`, style: { gridColumn: '1/-1' } }, 'เปิดสมุด'))));
}

// ======================================================================
// ตั้งค่าส่วนตัว: ธีม เสียง บัญชี
// ======================================================================
function themeCard(id, t, on, onPick, tag) {
  return h('button', { class: `theme-card${on ? ' on' : ''}`, onclick: onPick, type: 'button' },
    h('div', { class: 'pv', style: { background: t.bg } },
      h('i', { style: { background: t.a[0], left: '-10px', top: '-10px' } }), h('i', { style: { background: t.a[1], right: '-10px', top: '10px' } }),
      h('div', { class: 'card', style: { background: t.solid, boxShadow: `0 6px 16px -6px ${t.accent}` } },
        h('b', { style: { background: `linear-gradient(90deg, ${t.accent}, ${t.accent2})` } }), h('s', { style: { background: t.text } }))),
    h('div', { class: 'nm' }, t.name, tag ? h('small', null, tag) : null));
}

function viewSettings() {
  const p = prefs();
  const resolved = resolveTheme();
  const themesBox = h('div', { class: 'themes' });
  const paintThemes = () => {
    const cur = prefs().theme;
    themesBox.replaceChildren(...Object.entries(THEMES).map(([id, t]) => themeCard(id, t, cur === id, () => { savePrefs({ theme: id }); paintThemes(); }, t.dark ? 'มืด' : 'สว่าง')));
  };
  paintThemes();
  const festBox = h('div', { class: 'themes' },
    upcomingFestivals(bkkNow().date, 10).map((f) => themeCard(f.id, FESTIVAL_THEMES[f.id], resolved.id === f.id, () => { savePrefs({ theme: f.id }); paintThemes(); }, `${f.emoji} ${thaiDate(f.start, { short: true })}`)));

  const soundSeg = h('div', { class: 'seg' });
  const paintSound = () => soundSeg.replaceChildren(...Object.entries(sound.SOUND_STYLES).map(([k, l]) => h('button', { class: prefs().sound === k ? 'on' : '', onclick: () => { savePrefs({ sound: k }); paintSound(); setTimeout(sound.click, 30); } }, l)));
  paintSound();

  const profile = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      await attempt(() => api('/api/me/profile', { method: 'PUT', body: formData(profile) }), 'บันทึกข้อมูลแล้ว');
      await refreshSession();
    },
  }, h('div', { class: 'grid2' },
    field('ชื่อ-นามสกุล', h('input', { name: 'fullName', value: S.user.fullName, required: true }), { wide: true }),
    field('ตำแหน่ง', h('input', { name: 'position', value: S.user.position || '' })),
    field('กลุ่มงาน/ฝ่าย', h('input', { name: 'department', value: S.user.department || '' })),
    field('เบอร์โทร', h('input', { name: 'phone', value: S.user.phone || '' }))),
  h('div', { class: 'modal-foot' }, h('button', { class: 'btn primary' }, 'บันทึกข้อมูล')));

  const pw = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      await attempt(() => api('/api/me/password', { method: 'PUT', body: formData(pw) }), 'เปลี่ยนรหัสผ่านแล้ว');
      pw.reset();
    },
  }, h('div', { class: 'grid2' },
    field('รหัสผ่านเดิม', h('input', { name: 'current', type: 'password', required: true, autocomplete: 'current-password' })),
    field('รหัสผ่านใหม่', h('input', { name: 'next', type: 'password', minlength: 6, required: true, autocomplete: 'new-password' }))),
  h('div', { class: 'modal-foot' }, h('button', { class: 'btn' }, 'เปลี่ยนรหัสผ่าน')));

  const toggle = (label, key, def = true) => h('label', { class: 'switch' },
    h('input', { type: 'checkbox', checked: (prefs()[key] ?? def) !== false, onchange: (e) => savePrefs({ [key]: e.target.checked }) }), label);

  return [
    h('div', { class: 'topbar' }, h('div', null, h('h1', null, 'ธีม เสียง และบัญชี'), h('div', { class: 'sub' }, 'ปรับแต่งให้เหมาะกับการทำงานของคุณ'))),
    h('div', { class: 'row-gap' },
      h('section', { class: 'glass panel' }, h('h2', null, icon('palette'), 'ธีม'),
        resolved.festival ? h('p', { class: 'hint' }, `ขณะนี้ใช้ธีมเทศกาลอัตโนมัติ — ธีมที่เลือกจะกลับมาใช้เมื่อจบวันเทศกาล`) : null,
        themesBox,
        h('div', { class: 'sec-title' }, 'ธีมเทศกาลไทยและสากล (เปลี่ยนอัตโนมัติก่อนถึงวัน 7 วัน และกลับเองเมื่อจบวันเทศกาล)'),
        h('div', { style: { display: 'flex', gap: '22px', flexWrap: 'wrap', marginBottom: '14px' } },
          toggle('เปลี่ยนเป็นธีมเทศกาลอัตโนมัติ', 'festival'),
          toggle('เอฟเฟกต์อนุภาคประกอบธีม', 'particles')),
        festBox),
      h('section', { class: 'glass panel' }, h('h2', null, icon('volume'), 'เสียงคลิก'),
        soundSeg,
        h('div', { style: { display: 'flex', gap: '12px', alignItems: 'center', marginTop: '14px' } },
          h('span', { class: 'hint' }, 'ระดับเสียง'),
          h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: p.soundVolume ?? 0.5, onchange: (e) => { savePrefs({ soundVolume: +e.target.value }); sound.click(); } }),
          h('button', { class: 'btn sm', onclick: () => sound.success() }, 'ทดลองเสียง'))),
      h('div', { class: 'cols' },
        h('section', { class: 'glass panel' }, h('h2', null, icon('user'), 'ข้อมูลสมาชิก'), profile),
        h('section', { class: 'glass panel' }, h('h2', null, icon('lock'), 'รหัสผ่าน'), pw))),
  ];
}

// ======================================================================
// ผู้ดูแลระบบ
// ======================================================================
async function viewAdmin(r) {
  if (!S.isAdmin) {
    return h('div', { style: { maxWidth: '440px', margin: '6vh auto' } },
      h('div', { class: 'auth-card glass spot', style: { width: '100%' } },
        h('div', { class: 'wait-illu' }, icon('shield')),
        h('h1', { style: { textAlign: 'center' } }, 'ผู้ดูแลระบบ'), h('p', { class: 'lead', style: { textAlign: 'center' } }, 'ใส่ PIN เพื่อเข้าสู่ส่วนผู้ดูแล'),
        pinForm(() => render())));
  }
  const tab = r.params.tab || 'members';
  const TABS = [['members', 'users', 'สมาชิก', 'pendingMembers'], ['books', 'book', 'สมุดทะเบียน'], ['notify', 'telegram', 'แจ้งเตือน Telegram'], ['system', 'settings', 'ระบบและอัพเดต', 'updates']];
  const body = await ({ members: adminMembers, books: adminBooks, notify: adminNotify, system: adminSystem }[tab] || adminMembers)();
  return [
    h('div', { class: 'topbar' },
      h('div', null, h('h1', null, 'ผู้ดูแลระบบ'), h('div', { class: 'sub' }, 'สิทธิ์ผู้ดูแลจะล็อกอัตโนมัติเมื่อไม่ใช้งาน 30 นาที')),
      h('div', { class: 'tools' }, h('button', { class: 'btn', onclick: async () => { await api('/api/admin/lock', { method: 'POST' }); await refreshSession(); S.user ? go('/') : go('/login'); } }, icon('lock'), 'ล็อกผู้ดูแล'))),
    h('nav', { class: 'tabs' }, TABS.map(([k, ic, l, badge]) => h('a', { href: `#/admin/${k}`, class: k === tab ? 'on' : '', 'data-badge': badge }, icon(ic), l))),
    body,
  ];
}

async function adminMembers() {
  const users = await api('/api/admin/users');
  const ST = { pending: 'รออนุมัติ', active: 'ใช้งาน', rejected: 'ไม่อนุมัติ', disabled: 'ระงับ' };
  const act = (u, a, msg) => async () => {
    let body = {};
    if (a === 'reset-password') {
      const pw = await confirmBox('ตั้งรหัสผ่านใหม่', `ตั้งรหัสผ่านใหม่ให้ ${u.full_name}`, { input: 'รหัสผ่านใหม่ อย่างน้อย 6 ตัว', ok: 'บันทึก' });
      if (!pw) return;
      body = { password: pw.trim() };
    }
    if (a === 'delete' && !(await confirmBox('ลบสมาชิก', `ลบ ${u.full_name}?`, { danger: true, ok: 'ลบ' }))) return;
    await attempt(() => api(`/api/admin/users/${u.id}/${a}`, { method: 'POST', body }), msg);
    loadBadges();
    render();
  };
  const pending = users.filter((u) => u.status === 'pending');
  const item = (u) => h('div', { class: 'list-item' },
    h('div', { class: 'avatar' }, u.full_name.charAt(0)),
    h('div', { class: 'grow' }, h('b', null, u.full_name), ' ', h('span', { class: `status ${u.status}` }, ST[u.status]),
      h('small', null, [u.position, u.department, u.phone].filter(Boolean).join(' · ') || '—'),
      h('small', null, `@${u.username} · สมัคร ${thaiDateTime(u.created_at, { short: true })}${u.last_login ? ` · เข้าใช้ล่าสุด ${thaiDateTime(u.last_login, { short: true })}` : ''}`)),
    h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
      u.status === 'pending' ? [h('button', { class: 'btn primary sm', onclick: act(u, 'approve', 'อนุมัติแล้ว') }, icon('check'), 'อนุมัติ'), h('button', { class: 'btn sm danger', onclick: act(u, 'reject', 'ไม่อนุมัติ') }, 'ไม่อนุมัติ')] : null,
      u.status === 'active' ? [h('button', { class: 'btn sm', onclick: act(u, 'reset-password', 'ตั้งรหัสผ่านใหม่แล้ว') }, 'รีเซ็ตรหัสผ่าน'), h('button', { class: 'btn sm danger', onclick: act(u, 'disable', 'ระงับแล้ว') }, 'ระงับ')] : null,
      ['disabled', 'rejected'].includes(u.status) ? [h('button', { class: 'btn sm', onclick: act(u, 'enable', 'เปิดใช้งานแล้ว') }, 'เปิดใช้งาน'), h('button', { class: 'btn sm ghost danger', onclick: act(u, 'delete', 'ลบแล้ว') }, icon('trash'))] : null));
  return h('div', { class: 'row-gap' },
    h('section', { class: 'glass panel' }, h('h2', null, icon('bell'), 'รออนุมัติ', pending.length ? h('span', { class: 'dot count' }, pending.length) : null),
      pending.length ? h('div', { class: 'list' }, pending.map(item)) : h('p', { class: 'hint' }, 'ไม่มีคำขอสมัครที่รออนุมัติ')),
    h('section', { class: 'glass panel' }, h('h2', null, icon('users'), `สมาชิกทั้งหมด (${users.length - pending.length})`),
      h('div', { class: 'list' }, users.filter((u) => u.status !== 'pending').map(item))));
}

async function adminBooks() {
  await loadBooks();
  const edit = (b) => openModal(({ close }) => {
    const form = h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        const d = formData(form);
        await attempt(() => api(b ? `/api/admin/books/${b.id}` : '/api/admin/books', { method: b ? 'PUT' : 'POST', body: d }), 'บันทึกสมุดแล้ว');
        close(); render();
      },
    }, h('div', { class: 'grid2' },
      b ? null : field('ประเภทสมุด', h('select', { name: 'type' }, Object.entries(BOOK_TYPES).map(([k, t]) => h('option', { value: k }, t.label))), { wide: true }),
      field('ชื่อสมุด', h('input', { name: 'name', required: true, value: b?.name || '' }), { wide: true, required: true }),
      field('ปี พ.ศ.', h('input', { name: 'year', type: 'number', required: true, value: b?.year || toBE(bkkNow().year) })),
      field('เลขเริ่มต้น', h('input', { name: 'start_no', type: 'number', min: 1, value: b?.start_no || 1, disabled: !!b?.total }), { hint: b?.total ? 'มีการออกเลขแล้ว เปลี่ยนไม่ได้' : 'กรณีย้ายจากสมุดกระดาษ ใส่เลขถัดไปที่จะใช้' }),
      field('รหัสหนังสือส่ง "ที่" (เฉพาะทะเบียนส่ง)', h('input', { name: 'prefix', value: b?.prefix || '', placeholder: 'เช่น ศธ 04001/' }), { hint: 'ระบบจะต่อเลขทะเบียนส่งท้ายรหัสนี้ให้อัตโนมัติ', wide: true }),
      field('สีสันสมุด', h('input', { name: 'color', type: 'color', value: b?.color || '#2f5bd3', style: { height: '46px', padding: '4px' } })),
      field('ลำดับการแสดง', h('input', { name: 'sort', type: 'number', value: b?.sort ?? 0 }))),
    h('div', { class: 'modal-foot' }, h('button', { type: 'button', class: 'btn ghost', onclick: close }, 'ยกเลิก'), h('button', { class: 'btn primary' }, 'บันทึก')));
    return [modalHead(b ? 'แก้ไขสมุด' : 'สร้างสมุดใหม่', 'แต่ละเล่มมีลำดับเลขแยกของตัวเอง', close), form];
  });
  const row = (b) => h('div', { class: 'list-item' },
    h('div', { class: 'ledger-cover', style: { '--c': b.color, width: '38px', height: '48px' } }, icon(BOOK_TYPES[b.type].icon)),
    h('div', { class: 'grow' }, h('b', null, b.name), ' ', h('span', { class: `status ${b.status === 'open' ? 'active' : 'disabled'}` }, b.status === 'open' ? 'เปิดใช้งาน' : 'ปิดเล่ม'),
      h('small', null, `${b.typeLabel} · ปี ${b.year} · ล่าสุด ${b.last_no || '—'} · ถัดไป ${b.nextNo} · ${b.total} รายการ${b.prefix ? ` · รหัส ${b.prefix}` : ''}`),
      b.yearMismatch ? h('small', { style: { color: 'var(--warn)' } }, 'ขึ้นปีปฏิทินใหม่แล้ว — ควร "เปิดเล่มปีใหม่" เพื่อเริ่มเลข 1 ตามระเบียบงานสารบรรณ') : null),
    h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
      h('button', { class: 'btn sm', onclick: () => edit(b) }, icon('edit'), 'แก้ไข'),
      b.status === 'open' ? h('button', { class: 'btn sm', onclick: async () => { if (await confirmBox('เปิดเล่มปีใหม่', `ปิด "${b.name}" และสร้างเล่มใหม่ประเภทเดียวกัน เริ่มเลข 1`, { ok: 'เปิดเล่มใหม่' })) { await attempt(() => api(`/api/admin/books/${b.id}/rollover`, { method: 'POST' }), 'เปิดเล่มใหม่แล้ว'); render(); } } }, icon('refresh'), 'เปิดเล่มปีใหม่') : null,
      h('button', { class: 'btn sm', onclick: async () => { await attempt(() => api(`/api/admin/books/${b.id}/close`, { method: 'POST' }), b.status === 'open' ? 'ปิดเล่มแล้ว' : 'เปิดเล่มแล้ว'); render(); } }, icon('archive'), b.status === 'open' ? 'ปิดเล่ม' : 'เปิดอีกครั้ง'),
      !b.total ? h('button', { class: 'btn sm ghost danger', onclick: async () => { if (await confirmBox('ลบสมุด', `ลบ "${b.name}"?`, { danger: true, ok: 'ลบ' })) { await attempt(() => api(`/api/admin/books/${b.id}`, { method: 'DELETE' }), 'ลบแล้ว'); render(); } } }, icon('trash')) : null));
  return h('section', { class: 'glass panel' },
    h('h2', null, icon('book'), 'สมุดทะเบียน (แยกเล่ม แยกเลข)', h('span', { style: { flex: 1 } }), h('button', { class: 'btn primary sm', onclick: () => edit(null) }, icon('plus'), 'สร้างสมุด')),
    h('div', { class: 'list' }, S.books.map(row)));
}

async function adminNotify() {
  const s = await api('/api/admin/settings');
  const preview = h('div');
  const loadPreview = async () => {
    const m = await api('/api/admin/telegram/preview');
    const tmp = document.createElement('div');
    tmp.innerHTML = m.html.replace(/\n/g, '<br>');
    preview.replaceChildren(h('div', { class: 'tg-preview', html: tmp.innerHTML },),
      ...m.buttons.map((b) => h('span', { class: 'tgb' }, b.text)));
    if (!m.buttons.length) preview.append(h('p', { class: 'hint' }, 'ตั้งค่า "ที่อยู่เว็บของระบบ" เพื่อแสดงปุ่มลิงก์จองเลข'));
  };
  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      const d = formData(form);
      for (const k of ['notifyEnabled', 'notifyNewMember', 'notifyUpdate']) d[k] = form.elements[k].checked ? '1' : '0';
      await attempt(() => api('/api/admin/settings', { method: 'PUT', body: d }), 'บันทึกการตั้งค่าแล้ว');
      loadPreview();
    },
  },
  h('div', { class: 'grid2' },
    field('Bot Token', h('input', { name: 'tgToken', value: s.tgToken, placeholder: '123456789:AA…', autocomplete: 'off' }), { wide: true, hint: 'สร้างบอทกับ @BotFather แล้วนำ token มาใส่ จากนั้นเพิ่มบอทเข้ากลุ่มไลน์งาน/กลุ่ม Telegram ของหน่วยงาน' }),
    field('Chat ID (กลุ่มที่จะส่ง)', h('div', { style: { display: 'flex', gap: '8px' } },
      h('input', { class: 'input', name: 'tgChatId', value: s.tgChatId, placeholder: '-100…' }),
      h('button', { type: 'button', class: 'btn', onclick: async () => {
        const chats = await attempt(() => api('/api/admin/telegram/detect', { method: 'POST', body: { token: form.elements.tgToken.value } }));
        if (!chats.length) return toast('ไม่พบแชท — พิมพ์ /start ในกลุ่มที่มีบอทก่อน แล้วลองใหม่', 'info');
        openModal(({ close }) => [modalHead('เลือกแชท', 'แชทที่บอทได้รับข้อความล่าสุด', close),
          h('div', { class: 'list' }, chats.map((c) => h('button', { class: 'list-item btn', style: { justifyContent: 'flex-start' }, onclick: () => { form.elements.tgChatId.value = c.id; close(); } }, h('b', null, c.title || c.id), h('small', null, `${c.type} · ${c.id}`))))], { size: 'narrow' });
      } }, 'ค้นหา')), { hint: 'พิมพ์ /start ในกลุ่มแล้วกด "ค้นหา"' }),
    field('ที่อยู่เว็บของระบบ (สำหรับลิงก์จองเลข)', h('input', { name: 'baseUrl', value: s.baseUrl || location.origin, placeholder: 'https://saraban.example.go.th' }), { hint: 'ปุ่มลิงก์ใน Telegram ต้องเป็นที่อยู่ที่เปิดได้จากมือถือ (ถ้าเป็น localhost ระบบจะส่งเป็นลิงก์ในข้อความแทน)' }),
    field('เวลาแจ้งเตือนประจำวัน (จันทร์–ศุกร์)', h('input', { name: 'notifyTime', type: 'time', value: s.notifyTime || '08:30', required: true })),
    field('วันหยุดราชการที่ไม่ต้องแจ้งเตือน (YYYY-MM-DD บรรทัดละวัน)', h('textarea', { name: 'holidays', rows: 3, placeholder: '2026-12-07\n2026-12-10' }, s.holidays), { wide: true }),
    h('div', { class: 'wide', style: { display: 'flex', gap: '22px', flexWrap: 'wrap' } },
      h('label', { class: 'switch' }, h('input', { type: 'checkbox', name: 'notifyEnabled', checked: s.notifyEnabled === '1' }), 'แจ้งเลขล่าสุดทุกเช้า'),
      h('label', { class: 'switch' }, h('input', { type: 'checkbox', name: 'notifyNewMember', checked: s.notifyNewMember === '1' }), 'แจ้งเมื่อมีผู้สมัครใหม่'),
      h('label', { class: 'switch' }, h('input', { type: 'checkbox', name: 'notifyUpdate', checked: s.notifyUpdate === '1' }), 'แจ้งเมื่อมีอัพเดตรอติดตั้ง'))),
  h('p', { class: 'hint' }, 'เลขที่จองค้างไม่ลงรายละเอียดจะแสดงเป็นจุดแดงในระบบเท่านั้น ไม่ส่งแจ้งเตือนทางบอท', s.lastDailyResult ? h('br') : null, s.lastDailyResult ? `ผลการส่งล่าสุด: ${s.lastDailyResult}` : null),
  h('div', { class: 'modal-foot', style: { justifyContent: 'flex-start' } },
    h('button', { class: 'btn primary' }, icon('check'), 'บันทึก'),
    h('button', { type: 'button', class: 'btn', onclick: () => attempt(() => api('/api/admin/telegram/test', { method: 'POST' }), 'ส่งข้อความทดสอบแล้ว') }, icon('telegram'), 'ทดสอบการเชื่อมต่อ'),
    h('button', { type: 'button', class: 'btn', onclick: () => attempt(() => api('/api/admin/telegram/daily', { method: 'POST' }), 'ส่งสรุปประจำวันแล้ว') }, icon('send'), 'ส่งสรุปเลขตอนนี้')));
  loadPreview();
  return h('div', { class: 'cols' },
    h('section', { class: 'glass panel' }, h('h2', null, icon('telegram'), 'Telegram Bot'), form),
    h('section', { class: 'glass panel' }, h('h2', null, icon('eye'), 'ตัวอย่างข้อความเช้านี้'), preview));
}

async function adminSystem() {
  const s = await api('/api/admin/settings');
  const upBox = h('div');
  const paintUpdate = async (st) => {
    st = st || await api('/api/admin/update');
    upBox.replaceChildren(...[
      h('dl', { class: 'kv' },
        h('dt', null, 'เวอร์ชัน'), h('dd', null, `v${st.version}`, st.commit ? [' ', h('span', { class: 'commit' }, st.commit)] : null, st.branch ? ` · ${st.branch}` : ''),
        h('dt', null, 'ตรวจล่าสุด'), h('dd', null, st.lastCheck ? thaiDateTime(+st.lastCheck, { short: true }) : 'ยังไม่เคยตรวจ')),
      !st.git ? h('p', { class: 'hint' }, 'ระบบนี้ไม่ได้ติดตั้งผ่าน git — อัพเดตโดยคัดลอกไฟล์เวอร์ชันใหม่ทับ (ข้อมูลในโฟลเดอร์ data จะไม่หาย)') : null,
      st.dirty ? h('p', { class: 'hint', style: { color: 'var(--warn)' } }, 'มีไฟล์ระบบถูกแก้ไขในเครื่อง ระบบจะไม่ติดตั้งอัพเดตอัตโนมัติเพื่อป้องกันไฟล์เสียหาย') : null,
      st.pending.length ? [
        h('div', { class: 'sec-title' }, icon('rocket'), `อัพเดตใหม่รอการยืนยัน (${st.pending.length})`),
        h('ul', { class: 'timeline' }, st.pending.map((c) => h('li', null, h('b', null, c.subject), h('small', null, `${c.hash} · ${c.author} · ${thaiDateTime(Date.parse(c.date), { short: true })}`)))),
      ] : h('p', { class: 'hint' }, 'ระบบเป็นเวอร์ชันล่าสุดแล้ว'),
      h('div', { class: 'modal-foot', style: { justifyContent: 'flex-start' } },
        h('button', { class: 'btn', disabled: !st.git, onclick: async (e) => { e.currentTarget.disabled = true; paintUpdate(await attempt(() => api('/api/admin/update/check', { method: 'POST' })).catch(() => null)); } }, icon('refresh'), 'ตรวจสอบอัพเดต'),
        st.pending.length ? h('button', { class: 'btn primary', disabled: st.dirty, onclick: async () => {
          if (!(await confirmBox('ติดตั้งอัพเดต', 'ระบบจะสำรองฐานข้อมูล ติดตั้งเวอร์ชันใหม่ แล้วรีสตาร์ทประมาณ 5–10 วินาที', { ok: 'ติดตั้งเลย' }))) return;
          const r = await attempt(() => api('/api/admin/update/apply', { method: 'POST' }));
          toast(`ติดตั้งแล้ว (${r.before} → ${r.after}) กำลังรีสตาร์ท…`, 'info');
          setTimeout(() => location.reload(), 8000);
        } }, icon('rocket'), 'ติดตั้งอัพเดตตอนนี้') : null)].flat().filter(Boolean));
  };
  paintUpdate().catch((e) => upBox.replaceChildren(h('p', { class: 'hint' }, e.message)));

  const general = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      const d = formData(general);
      d.festivalAuto = general.elements.festivalAuto.checked ? '1' : '0';
      await attempt(() => api('/api/admin/settings', { method: 'PUT', body: d }), 'บันทึกแล้ว');
      await refreshSession();
    },
  }, h('div', { class: 'grid2' },
    field('ชื่อหน่วยงาน', h('input', { name: 'orgName', value: s.orgName, required: true }), { wide: true }),
    field('บังคับธีมเทศกาล (ทุกคน)', h('select', { name: 'festivalForce' }, h('option', { value: '' }, '— ไม่บังคับ (อัตโนมัติตามวันที่) —'),
      Object.entries(FESTIVAL_THEMES).map(([k, t]) => h('option', { value: k, selected: s.festivalForce === k }, t.name)))),
    field('สาขา git สำหรับอัพเดต', h('input', { name: 'updateBranch', value: s.updateBranch, placeholder: 'เว้นว่าง = สาขาปัจจุบัน' })),
    h('label', { class: 'switch wide' }, h('input', { type: 'checkbox', name: 'festivalAuto', checked: s.festivalAuto === '1' }), 'เปิดธีมเทศกาลอัตโนมัติ (ก่อนถึงวัน 7 วัน และกลับเองหลังจบวันเทศกาล)')),
  h('div', { class: 'modal-foot', style: { justifyContent: 'flex-start' } }, h('button', { class: 'btn primary' }, 'บันทึก')));

  const pinF = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      await attempt(() => api('/api/admin/pin', { method: 'PUT', body: formData(pinF) }), 'เปลี่ยน PIN แล้ว');
      pinF.reset();
    },
  }, h('div', { class: 'grid2' },
    field('PIN ปัจจุบัน', pinInput('current')),
    field('PIN ใหม่', pinInput('next')),
    field('ยืนยัน PIN ใหม่', pinInput('next2'))),
  h('div', { class: 'modal-foot', style: { justifyContent: 'flex-start' } }, h('button', { class: 'btn' }, 'เปลี่ยน PIN')));

  return h('div', { class: 'row-gap' },
    h('div', { class: 'cols' },
      h('section', { class: 'glass panel' }, h('h2', null, icon('rocket'), 'อัพเดตระบบ'), h('p', { class: 'hint', style: { marginTop: 0 } }, 'ระบบตรวจหาเวอร์ชันใหม่ทุกวันและดาวน์โหลดมารอไว้ จะติดตั้งเมื่อผู้ดูแลกดยืนยันเท่านั้น'), upBox),
      h('section', { class: 'glass panel' }, h('h2', null, icon('settings'), 'ทั่วไป'), general)),
    h('div', { class: 'cols' },
      h('section', { class: 'glass panel' }, h('h2', null, icon('shield'), 'PIN ผู้ดูแลระบบ'), pinF),
      h('section', { class: 'glass panel' }, h('h2', null, icon('database'), 'สำรองข้อมูล'),
        h('p', { class: 'hint', style: { marginTop: 0 } }, 'ดาวน์โหลดไฟล์ฐานข้อมูลทั้งหมด (สมาชิก สมุด เลข ลายเซ็น) เก็บไว้เป็นระยะ ระบบจะสำรองให้อัตโนมัติก่อนติดตั้งอัพเดตทุกครั้ง'),
        h('a', { class: 'btn', href: '/api/admin/backup' }, icon('download'), 'ดาวน์โหลดไฟล์สำรอง'))));
}

// ======================================================================
// เริ่มต้น
// ======================================================================
(async function start() {
  initSpotlight();
  applyLook();
  try {
    await refreshSession();
    if (S.user || S.isAdmin) await Promise.all([loadBooks(), loadBadges()]);
  } catch (e) {
    $app.replaceChildren(h('div', { class: 'auth' }, h('div', { class: 'auth-card glass' }, h('h1', null, 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้'), h('p', { class: 'lead' }, e.message))));
    return;
  }
  render();
  // ตรวจวันเปลี่ยน (ธีมเทศกาลเปลี่ยน/กลับอัตโนมัติแม้เปิดหน้าค้างไว้)
  let day = bkkNow().date;
  setInterval(() => { const d = bkkNow().date; if (d !== day) { day = d; applyLook(); } }, 60_000);
})();
