/**
 * สมุดคุมเลขสารบรรณ v1.0.0 — Google Apps Script
 * ไฟล์นี้สร้างอัตโนมัติจาก gas/build.mjs (แก้ไขที่ซอร์สใน public/js และ gas/server แล้ว build ใหม่)
 */
var Shared = (function () {
var __mods = {}, __cache = {};
function __def(id, fn) { __mods[id] = fn; }
function __req(id) { if (!__cache[id]) { if (!__mods[id]) throw new Error('module not found: ' + id); __cache[id] = __mods[id](); } return __cache[id]; }
__def("shared/thaidate", function () {
// วันที่/เวลาแบบไทย (ใช้ร่วมกันทั้งฝั่งเซิร์ฟเวอร์และเบราว์เซอร์) — อิงเวลาประเทศไทยเสมอ
const TZ = 'Asia/Bangkok';
const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const TH_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const TH_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

// ประเทศไทยไม่มีเวลาออมแสง (UTC+7 ตลอดปี) จึงคำนวณตรงได้ ไม่ต้องพึ่ง Intl
// (ใช้ได้เหมือนกันทั้ง Node.js, เบราว์เซอร์ และ Google Apps Script)
const p2 = (n) => String(n).padStart(2, '0');

/** คืนค่า { date:'YYYY-MM-DD', time:'HH:MM', dow:0-6, year } ตามเวลาไทย */
function bkkNow(d = new Date()) {
  const t = new Date(d.getTime() + 7 * 3600e3);
  const date = `${t.getUTCFullYear()}-${p2(t.getUTCMonth() + 1)}-${p2(t.getUTCDate())}`;
  return { date, time: `${p2(t.getUTCHours())}:${p2(t.getUTCMinutes())}`, seconds: p2(t.getUTCSeconds()), dow: t.getUTCDay(), year: t.getUTCFullYear() };
}

function isoAddDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isoDiffDays(a, b) {
  return Math.round((new Date(`${a}T00:00:00Z`) - new Date(`${b}T00:00:00Z`)) / 86400000);
}

const toBE = (y) => +y + 543;

/** 2026-11-08 → "8 พฤศจิกายน 2569" */
function thaiDate(iso, { short = false, day = false } = {}) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  const months = short ? TH_MONTHS_SHORT : TH_MONTHS;
  const yy = short ? String(toBE(y)).slice(2) : toBE(y);
  let s = `${d} ${months[m - 1]} ${yy}`;
  if (day) s = `วัน${TH_DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}ที่ ${s}`;
  return s;
}

function thaiDateTime(ms, opts) {
  if (!ms) return '';
  const n = bkkNow(new Date(ms));
  return `${thaiDate(n.date, opts)} ${n.time} น.`;
}

const TH_DIGITS = '๐๑๒๓๔๕๖๗๘๙';
const thaiDigits = (s) => String(s).replace(/[0-9]/g, (c) => TH_DIGITS[c]);

return { TZ, TH_MONTHS, TH_MONTHS_SHORT, TH_DAYS, bkkNow, isoAddDays, isoDiffDays, toBE, thaiDate, thaiDateTime, thaiDigits };
});

__def("shared/schema", function () {
// โครงสร้างสมุดแต่ละประเภท (ใช้ร่วมกันทั้งฝั่งเซิร์ฟเวอร์และเบราว์เซอร์)
// อ้างอิงแบบทะเบียนหนังสือรับ / ทะเบียนหนังสือส่ง ตามระเบียบสำนักนายกรัฐมนตรีว่าด้วยงานสารบรรณ
// และสมุดคุมเลขรับคำร้องทั่วไป

const BOOK_TYPES = {
  receive: {
    label: 'ทะเบียนหนังสือรับ',
    short: 'เลขรับ',
    noLabel: 'เลขทะเบียนรับ',
    dateLabel: 'วันที่รับ',
    icon: 'inbox',
    canSign: true,
    fields: [
      { key: 'doc_ref', label: 'ที่', placeholder: 'เลขที่หนังสือของผู้ส่ง เช่น ศธ ๐๔๐๐๑/ว๑๒๓' },
      { key: 'doc_date', label: 'ลงวันที่', type: 'date' },
      { key: 'sender', label: 'จาก', placeholder: 'หน่วยงาน/ผู้ส่ง', suggest: true },
      { key: 'recipient', label: 'ถึง', placeholder: 'ผู้รับ/ตำแหน่ง', suggest: true },
      { key: 'subject', label: 'เรื่อง', required: true, wide: true },
      { key: 'action', label: 'การปฏิบัติ', placeholder: 'เช่น เสนอ นายก / กองช่าง', wide: true, suggest: true },
      { key: 'note', label: 'หมายเหตุ', wide: true },
    ],
    columns: ['no', 'entry_date', 'doc_ref', 'doc_date', 'sender', 'recipient', 'subject', 'action', 'note'],
  },
  send: {
    label: 'ทะเบียนหนังสือส่ง',
    short: 'เลขส่ง',
    noLabel: 'เลขทะเบียนส่ง',
    dateLabel: 'ลงวันที่',
    icon: 'send',
    canSign: false,
    fields: [
      { key: 'sender', label: 'จาก', placeholder: 'เช่น อบต.', suggest: true, remember: true },
      { key: 'recipient', label: 'ถึง', placeholder: 'หน่วยงาน/บุคคล/บริษัทผู้รับ', suggest: true, multi: true },
      { key: 'subject', label: 'เรื่อง', required: true, wide: true, suggest: true },
      { key: 'action', label: 'การปฏิบัติ', placeholder: 'กอง/ฝ่ายเจ้าของเรื่อง เช่น กองช่าง', suggest: true, remember: true },
      { key: 'note', label: 'หมายเหตุ', wide: true },
    ],
    columns: ['no', 'doc_ref', 'entry_date', 'sender', 'recipient', 'subject', 'action', 'note'],
  },
  petition: {
    label: 'สมุดคุมเลขรับคำร้องทั่วไป',
    short: 'เลขคำร้อง',
    noLabel: 'เลขรับคำร้อง',
    dateLabel: 'วันที่รับ',
    icon: 'petition',
    canSign: false,
    fields: [
      { key: 'petitioner', label: 'ชื่อผู้ยื่นคำร้อง', required: true },
      { key: 'contact', label: 'ที่อยู่ / โทรศัพท์' },
      { key: 'subject', label: 'เรื่อง', required: true, wide: true },
      { key: 'recipient', label: 'ผู้รับเรื่อง / ส่งต่อถึง', suggest: true },
      { key: 'action', label: 'การดำเนินการ', wide: true },
      { key: 'note', label: 'หมายเหตุ', wide: true },
    ],
    columns: ['no', 'entry_date', 'petitioner', 'contact', 'subject', 'recipient', 'action', 'note'],
  },
};

const COLUMN_LABELS = {
  doc_ref: 'ที่', doc_date: 'ลงวันที่', sender: 'จาก', recipient: 'ถึง', subject: 'เรื่อง',
  action: 'การปฏิบัติ', note: 'หมายเหตุ', petitioner: 'ผู้ยื่นคำร้อง', contact: 'ที่อยู่/โทร',
};

/** ทุกฟิลด์ข้อมูลที่ผู้ใช้กรอกได้ (whitelist) */
const ALL_FIELDS = ['doc_ref', 'doc_date', 'sender', 'recipient', 'subject', 'action', 'note', 'petitioner', 'contact'];

const fieldsOf = (type) => BOOK_TYPES[type]?.fields.map((f) => f.key) || [];

/** เลขที่แสดงผล: ทะเบียนส่ง → "ที่ <prefix><no>", คำร้อง → "<no>/<ปี>" */
function displayNo(book, no) {
  if (!book) return String(no);
  if (book.type === 'petition') return `${no}/${book.year}`;
  return String(no);
}

function sendRef(book, no) {
  return `${book.prefix || ''}${no}`;
}

const STATUS_LABEL = { reserved: 'จองไว้', filled: 'ลงรายละเอียดแล้ว', cancelled: 'ยกเลิก' };

return { BOOK_TYPES, COLUMN_LABELS, ALL_FIELDS, fieldsOf, displayNo, sendRef, STATUS_LABEL };
});

__def("shared/festivals", function () {
// ธีมเทศกาล ไทยและสากล — เปิดอัตโนมัติก่อนถึงวันเทศกาล 7 วัน และกลับเป็นธีมเดิมเมื่อจบวันเทศกาล
const { isoAddDays, isoDiffDays } = __req("shared/thaidate");
const LEAD_DAYS = 7;

const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

/** วันเสาร์ที่ 2 ของเดือนมกราคม (วันเด็กแห่งชาติ) */
function secondSaturdayJan(y) {
  const first = new Date(Date.UTC(y, 0, 1)).getUTCDay();
  const firstSat = 1 + ((6 - first + 7) % 7);
  return ymd(y, 1, firstSat + 7);
}

// วันตามปฏิทินจันทรคติ (ตารางล่วงหน้า) — ถ้าเลยปีในตาราง เทศกาลนั้นจะไม่แสดงจนกว่าจะเพิ่มข้อมูล
const CHINESE_NEW_YEAR = {
  2024: '2024-02-10', 2025: '2025-01-29', 2026: '2026-02-17', 2027: '2027-02-06', 2028: '2028-01-26',
  2029: '2029-02-13', 2030: '2030-02-03', 2031: '2031-01-23', 2032: '2032-02-11', 2033: '2033-01-31',
  2034: '2034-02-19', 2035: '2035-02-08',
};
const LOY_KRATHONG = {
  2024: '2024-11-15', 2025: '2025-11-05', 2026: '2026-11-24', 2027: '2027-11-13', 2028: '2028-11-02',
  2029: '2029-11-21', 2030: '2030-11-10',
};

/**
 * range(y) คืน [วันเริ่ม, วันสิ้นสุด] ของเทศกาลในปี ค.ศ. y (หรือ null)
 * theme = คีย์ธีมใน themes.js
 */
const FESTIVALS = [
  { id: 'newyear', name: 'วันขึ้นปีใหม่', scope: 'สากล', emoji: '🎆', range: (y) => [ymd(y, 1, 1), ymd(y, 1, 1)] },
  { id: 'children', name: 'วันเด็กแห่งชาติ', scope: 'ไทย', emoji: '🎈', range: (y) => [secondSaturdayJan(y), secondSaturdayJan(y)] },
  { id: 'valentine', name: 'วันวาเลนไทน์', scope: 'สากล', emoji: '💗', range: (y) => [ymd(y, 2, 14), ymd(y, 2, 14)] },
  { id: 'chinese', name: 'วันตรุษจีน', scope: 'ไทย-จีน', emoji: '🏮', range: (y) => (CHINESE_NEW_YEAR[y] ? [CHINESE_NEW_YEAR[y], CHINESE_NEW_YEAR[y]] : null) },
  { id: 'songkran', name: 'เทศกาลสงกรานต์', scope: 'ไทย', emoji: '💦', range: (y) => [ymd(y, 4, 13), ymd(y, 4, 15)] },
  { id: 'mother', name: 'วันแม่แห่งชาติ', scope: 'ไทย', emoji: '🌼', range: (y) => [ymd(y, 8, 12), ymd(y, 8, 12)] },
  { id: 'halloween', name: 'วันฮาโลวีน', scope: 'สากล', emoji: '🎃', range: (y) => [ymd(y, 10, 31), ymd(y, 10, 31)] },
  { id: 'loykrathong', name: 'วันลอยกระทง', scope: 'ไทย', emoji: '🪷', range: (y) => (LOY_KRATHONG[y] ? [LOY_KRATHONG[y], LOY_KRATHONG[y]] : null) },
  { id: 'father', name: 'วันพ่อแห่งชาติ', scope: 'ไทย', emoji: '💛', range: (y) => [ymd(y, 12, 5), ymd(y, 12, 5)] },
  { id: 'christmas', name: 'วันคริสต์มาส', scope: 'สากล', emoji: '🎄', range: (y) => [ymd(y, 12, 25), ymd(y, 12, 25)] },
];

/** ทุกช่วงเทศกาลที่ครอบคลุมวันที่ iso (รวมช่วงนับถอยหลัง 7 วัน) */
function festivalWindows(iso) {
  const y = +iso.slice(0, 4);
  const out = [];
  for (const f of FESTIVALS) {
    for (const yy of [y - 1, y, y + 1]) {
      const r = f.range(yy);
      if (!r) continue;
      const [start, end] = r;
      const showFrom = isoAddDays(start, -LEAD_DAYS);
      if (iso >= showFrom && iso <= end) {
        out.push({ ...f, start, end, showFrom, ongoing: iso >= start, daysLeft: Math.max(0, isoDiffDays(start, iso)) });
      }
    }
  }
  return out;
}

/**
 * เทศกาลที่ใช้งานในวันนั้น
 * ถ้าช่วงทับกัน: เทศกาลที่ถึงวันแล้วมาก่อน จากนั้นเทศกาลที่ใกล้ที่สุด
 */
function activeFestival(iso) {
  const list = festivalWindows(iso);
  list.sort((a, b) => (b.ongoing - a.ongoing) || a.start.localeCompare(b.start));
  return list[0] || null;
}

function upcomingFestivals(iso, count = 4) {
  const y = +iso.slice(0, 4);
  const all = [];
  for (const f of FESTIVALS) for (const yy of [y, y + 1]) {
    const r = f.range(yy);
    if (r && r[1] >= iso) all.push({ ...f, start: r[0], end: r[1], showFrom: isoAddDays(r[0], -LEAD_DAYS) });
  }
  return all.sort((a, b) => a.start.localeCompare(b.start)).slice(0, count);
}

return { LEAD_DAYS, FESTIVALS, festivalWindows, activeFestival, upcomingFestivals };
});

return Object.assign({}, __req("shared/thaidate"), __req("shared/schema"), __req("shared/festivals"));
})();
var { TZ, TH_MONTHS, TH_MONTHS_SHORT, TH_DAYS, bkkNow, isoAddDays, isoDiffDays, toBE, thaiDate, thaiDateTime, thaiDigits, BOOK_TYPES, COLUMN_LABELS, ALL_FIELDS, fieldsOf, displayNo, sendRef, STATUS_LABEL, LEAD_DAYS, FESTIVALS, festivalWindows, activeFestival, upcomingFestivals } = Shared;

// ----- 00_db.js -----
// =====================================================================
// ฐานข้อมูลบน Google Sheets (1 แท็บ = 1 ตาราง) + ค่าตั้งระบบใน Script Properties
// =====================================================================
var SCHEMA_ = {
  Users: ['id', 'username', 'pass', 'full_name', 'position', 'department', 'phone', 'status', 'prefs', 'created_at', 'approved_at', 'last_login'],
  Sessions: ['token', 'user_id', 'admin_until', 'expires_at'],
  Books: ['id', 'type', 'name', 'year', 'prefix', 'start_no', 'last_no', 'color', 'status', 'sort', 'created_at'],
  Entries: ['id', 'book_id', 'no', 'entry_date', 'entry_time', 'status', 'mode', 'reserved_by', 'reserved_name', 'doc_ref', 'doc_date',
    'sender', 'recipient', 'subject', 'action', 'note', 'petitioner', 'contact', 'created_by', 'created_at', 'filled_at', 'updated_at', 'edit_count', 'cancel_reason'],
  Logs: ['id', 'entry_id', 'user_id', 'actor', 'action', 'detail', 'at'],
  // ลายเซ็น (PNG base64) แบ่งเก็บหลายช่อง เพราะ 1 ช่องของ Sheets เก็บได้ไม่เกิน 50,000 ตัวอักษร
  Signatures: ['id', 'entry_id', 'user_id', 'name', 'position', 'signed_at', 'img1', 'img2', 'img3', 'img4', 'img5', 'img6', 'img7', 'img8', 'img9', 'img10', 'img11', 'img12'],
};
var SHEET_LABEL_ = { Users: 'สมาชิก', Sessions: 'session', Books: 'สมุด', Entries: 'รายการเลข', Logs: 'ประวัติ', Signatures: 'ลายเซ็น' };
var INT_COLS_ = {
  id: 1, user_id: 1, admin_until: 1, expires_at: 1, book_id: 1, no: 1, year: 1, start_no: 1, last_no: 1, sort: 1,
  created_at: 1, approved_at: 1, last_login: 1, reserved_by: 1, created_by: 1, filled_at: 1, updated_at: 1, edit_count: 1, entry_id: 1, at: 1, signed_at: 1,
};
var NULLABLE_INT_ = { approved_at: 1, last_login: 1, reserved_by: 1, created_by: 1, filled_at: 1, user_id: 1 };

var SETTING_DEFAULTS_ = {
  orgName: '', adminPin: '', tgToken: '', tgChatId: '', baseUrl: '',
  notifyEnabled: '1', notifyTime: '08:30', notifyNewMember: '1', notifyUpdate: '1', holidays: '',
  festivalAuto: '1', festivalForce: '', lastDaily: '', lastDailyResult: '',
  updateLastCheck: '', updatePending: '[]', deploymentId: '', spreadsheetId: '',
};

var DBC_ = {}; // แคชตารางระหว่างคำขอเดียว
var SS_ = null;

function props_() { return PropertiesService.getScriptProperties(); }
function getSetting(k) { var v = props_().getProperty(k); return v === null ? (SETTING_DEFAULTS_[k] !== undefined ? SETTING_DEFAULTS_[k] : '') : v; }
function setSetting(k, v) { props_().setProperty(k, String(v === undefined || v === null ? '' : v)); }

/** สเปรดชีตฐานข้อมูล: ค่าที่ตั้งไว้ > สเปรดชีตที่ผูกสคริปต์ > สร้างใหม่อัตโนมัติ */
function ss_() {
  if (SS_) return SS_;
  var id = getSetting('spreadsheetId');
  if (id) { SS_ = SpreadsheetApp.openById(id); return SS_; }
  try { SS_ = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { SS_ = null; }
  if (!SS_) {
    SS_ = SpreadsheetApp.create('สมุดคุมเลขสารบรรณ (ฐานข้อมูล)');
    setSetting('spreadsheetId', SS_.getId());
  }
  return SS_;
}

function toCell_(k, v) {
  if (v === null || v === undefined) return '';
  return String(v);
}
function fromCell_(k, v) {
  if (v instanceof Date) v = Utilities.formatDate(v, 'Asia/Bangkok', k === 'entry_time' ? 'HH:mm' : 'yyyy-MM-dd');
  if (INT_COLS_[k]) {
    if (v === '' || v === null) return NULLABLE_INT_[k] ? null : 0;
    return Number(v) || 0;
  }
  return v === null || v === undefined ? '' : String(v);
}

function table_(name) {
  if (DBC_[name]) return DBC_[name];
  var ss = ss_();
  var cols = SCHEMA_[name];
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#eef2ff');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
    if (name === 'Signatures') sh.hideSheet();
    if (name === 'Sessions') sh.hideSheet();
  }
  var width = Math.max(1, sh.getLastColumn());
  var head = sh.getRange(1, 1, 1, width).getValues()[0].map(String);
  // migration: เพิ่มคอลัมน์ใหม่ที่ยังไม่มี (สำหรับการอัพเดตเวอร์ชัน)
  cols.forEach(function (c) {
    if (head.indexOf(c) < 0) { head.push(c); sh.getRange(1, head.length).setValue(c).setFontWeight('bold'); }
  });
  var last = sh.getLastRow();
  var rows = [];
  if (last > 1) {
    var vals = sh.getRange(2, 1, last - 1, head.length).getValues();
    for (var i = 0; i < vals.length; i++) {
      var o = { __r: i + 2 };
      var empty = true;
      for (var j = 0; j < head.length; j++) {
        if (!head[j]) continue;
        o[head[j]] = fromCell_(head[j], vals[i][j]);
        if (vals[i][j] !== '' && vals[i][j] !== null) empty = false;
      }
      if (!empty) rows.push(o);
    }
  }
  var t = {
    name: name, sheet: sh, head: head, rows: rows,
    all: function () { return rows; },
    find: function (fn) { for (var i = 0; i < rows.length; i++) if (fn(rows[i])) return rows[i]; return null; },
    filter: function (fn) { return rows.filter(fn); },
    byId: function (id) { id = Number(id); return this.find(function (r) { return r.id === id; }); },
    nextId: function () { var m = 0; rows.forEach(function (r) { if (r.id > m) m = r.id; }); return m + 1; },
    write_: function (o) {
      var line = head.map(function (k) { return toCell_(k, o[k]); });
      var rg = sh.getRange(o.__r, 1, 1, head.length);
      rg.setNumberFormat('@');
      rg.setValues([line]);
    },
    insert: function (o) {
      if (head.indexOf('id') >= 0 && !o.id) o.id = this.nextId();
      o.__r = Math.max(sh.getLastRow(), 1) + 1;
      if (o.__r > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 200);
      this.write_(o);
      rows.push(o);
      return o;
    },
    update: function (o, patch) {
      for (var k in patch) o[k] = patch[k];
      this.write_(o);
      return o;
    },
    remove: function (o) {
      sh.deleteRow(o.__r);
      DBC_[name] = null;
    },
  };
  DBC_[name] = t;
  return t;
}

function clean_(o) {
  if (!o) return o;
  var out = {};
  for (var k in o) if (k !== '__r' && k.indexOf('img') !== 0 && k !== 'pass') out[k] = o[k];
  return out;
}

/** ใช้ล็อกระดับสคริปต์ เพื่อไม่ให้เลขซ้ำเมื่อหลายคนกดพร้อมกัน */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) throw httpError_(503, 'ระบบกำลังทำงานหนาแน่น กรุณาลองใหม่อีกครั้ง');
  try { DBC_ = {}; return fn(); } finally { SpreadsheetApp.flush(); lock.releaseLock(); }
}

// ----- 10_auth.js -----
// =====================================================================
// สมาชิก / session / PIN ผู้ดูแลระบบ
// =====================================================================
var SESSION_DAYS_ = 30;
var ADMIN_MINUTES_ = 30;

function httpError_(status, message) { var e = new Error(message); e.httpStatus = status; return e; }
function fail(status, message) { throw httpError_(status, message); }

function digest_(secret, salt) {
  var h = salt + '|' + String(secret);
  for (var i = 0; i < 120; i++) {
    h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + salt, Utilities.Charset.UTF_8));
  }
  return h;
}
function hashSecret(secret) {
  var salt = Utilities.getUuid().replace(/-/g, '');
  return salt + ':' + digest_(secret, salt);
}
function verifySecret(secret, stored) {
  if (!stored || String(stored).indexOf(':') < 0) return false;
  var p = String(stored).split(':');
  return digest_(secret, p[0]) === p[1];
}

function newToken_() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''); }

function createSession(userId, adminUntil) {
  var token = newToken_();
  table_('Sessions').insert({ token: token, user_id: userId || null, admin_until: adminUntil || 0, expires_at: Date.now() + SESSION_DAYS_ * 864e5 });
  return token;
}

function loadAuth(token) {
  var none = { token: null, user: null, isAdmin: false, session: null };
  if (!token) return none;
  var S = table_('Sessions');
  var s = S.find(function (r) { return r.token === token; });
  if (!s || s.expires_at < Date.now()) return none;
  var user = s.user_id ? table_('Users').byId(s.user_id) : null;
  var isAdmin = s.admin_until > Date.now();
  // ต่ออายุสิทธิ์ผู้ดูแลเมื่อยังใช้งานอยู่ (เขียนเฉพาะเมื่อเหลือน้อยกว่า 20 นาที เพื่อลดการเขียนชีต)
  if (isAdmin && s.admin_until - Date.now() < 20 * 60e3) S.update(s, { admin_until: Date.now() + ADMIN_MINUTES_ * 60e3 });
  return { token: token, user: user, isAdmin: isAdmin, session: s };
}

function publicUser(u) {
  if (!u) return null;
  var prefs = {};
  try { prefs = JSON.parse(u.prefs || '{}'); } catch (e) {}
  return { id: u.id, username: u.username, fullName: u.full_name, position: u.position, department: u.department, phone: u.phone, status: u.status, prefs: prefs };
}

function requireUser(ctx) {
  if (!ctx.auth.user) fail(401, 'กรุณาเข้าสู่ระบบ');
  if (ctx.auth.user.status !== 'active') fail(403, 'บัญชียังไม่ได้รับการอนุมัติจากผู้ดูแลระบบ');
  return ctx.auth.user;
}
function requireAdmin(ctx) { if (!ctx.auth.isAdmin) fail(403, 'ต้องปลดล็อกผู้ดูแลระบบด้วย PIN'); }

function isSetupDone() { return !!getSetting('adminPin'); }
function validPin(pin) { return /^\d{6,8}$/.test(String(pin || '')); }
function setAdminPin(pin) {
  if (!validPin(pin)) fail(400, 'PIN ต้องเป็นตัวเลข 6–8 หลัก');
  setSetting('adminPin', hashSecret(pin));
}

function checkPin(pin) {
  var cache = CacheService.getScriptCache();
  if (cache.get('pinLocked')) fail(429, 'ใส่ PIN ผิดหลายครั้ง กรุณารอ 5 นาที');
  if (!verifySecret(pin, getSetting('adminPin'))) {
    var n = Number(cache.get('pinFails') || 0) + 1;
    if (n >= 5) { cache.put('pinLocked', '1', 300); cache.remove('pinFails'); } else cache.put('pinFails', String(n), 600);
    fail(401, 'PIN ไม่ถูกต้อง');
  }
  cache.remove('pinFails');
}

/** ปลดล็อกผู้ดูแล: ถ้ามี session อยู่แล้วให้ยกระดับ ถ้าไม่มีสร้าง session ผู้ดูแลอย่างเดียว */
function elevate(ctx) {
  var until = Date.now() + ADMIN_MINUTES_ * 60e3;
  if (ctx.auth.session) { table_('Sessions').update(ctx.auth.session, { admin_until: until }); return null; }
  return createSession(null, until);
}

function cleanupSessions() {
  var S = table_('Sessions');
  var dead = S.filter(function (r) { return r.expires_at < Date.now(); }).sort(function (a, b) { return b.__r - a.__r; });
  dead.forEach(function (r) { S.sheet.deleteRow(r.__r); });
  DBC_.Sessions = null;
}

// ----- 20_ledger.js -----
// =====================================================================
// ออกเลข / จองเลข / ลงรายละเอียด / เซ็นรับ — แต่ละเล่มมีลำดับเลขของตัวเอง
// =====================================================================
var MAX_RESERVE_ = 20;
var MAX_BATCH_ = 50;

function getBook(id) {
  var b = table_('Books').byId(id);
  if (!b) fail(404, 'ไม่พบสมุด');
  return b;
}
function nextNo(b) { return Math.max(b.last_no, b.start_no - 1) + 1; }

function bookSummary(b) {
  var today = bkkNow().date;
  var es = table_('Entries').filter(function (e) { return e.book_id === b.id; });
  var signed = {};
  if (b.type === 'receive') table_('Signatures').all().forEach(function (s) { signed[s.entry_id] = 1; });
  var last = null, pending = 0, todayCount = 0, unsigned = 0;
  es.forEach(function (e) {
    if (!last || e.no > last.no) last = e;
    if (e.status === 'reserved') pending++;
    if (e.entry_date === today) todayCount++;
    if (b.type === 'receive' && e.status === 'filled' && !signed[e.id]) unsigned++;
  });
  var out = clean_(b);
  out.typeLabel = BOOK_TYPES[b.type].label;
  out.nextNo = nextNo(b);
  out.pending = pending;
  out.total = es.length;
  out.todayCount = todayCount;
  out.unsigned = unsigned;
  out.last = last ? { no: last.no, entry_date: last.entry_date, subject: last.subject, status: last.status } : null;
  out.yearMismatch = b.status === 'open' && b.year !== toBE(bkkNow().year);
  return out;
}

function cleanFields_(type, input) {
  var out = {};
  fieldsOf(type).forEach(function (k) {
    if (input[k] === undefined) return;
    var max = (k === 'note' || k === 'action' || k === 'subject') ? 2000 : 300;
    out[k] = String(input[k] === null ? '' : input[k]).trim().slice(0, max);
  });
  if (out.doc_date && !/^\d{4}-\d{2}-\d{2}$/.test(out.doc_date)) out.doc_date = '';
  return out;
}
function requireFields_(type, data) {
  BOOK_TYPES[type].fields.forEach(function (f) {
    if (f.required && !String(data[f.key] || '').trim()) fail(400, 'กรุณากรอก "' + f.label + '"');
  });
}

function log_(entryId, user, action, detail) {
  table_('Logs').insert({ entry_id: entryId, user_id: user ? user.id : null, actor: user ? user.full_name : 'ผู้ดูแลระบบ', action: action, detail: detail ? JSON.stringify(detail) : '', at: Date.now() });
}

function allocate_(b, count) {
  if (b.status !== 'open') fail(400, 'สมุดเล่มนี้ปิดแล้ว');
  var first = nextNo(b);
  table_('Books').update(b, { last_no: first + count - 1 });
  return first;
}

function getEntry(id) {
  var e = table_('Entries').byId(id);
  if (!e) fail(404, 'ไม่พบรายการ');
  return e;
}

function issueNow(bookId, user, input) {
  var list = Array.isArray(input.recipients)
    ? input.recipients.map(function (r) { return String(r === null || r === undefined ? '' : r).trim(); }).filter(String)
    : null;
  if (list && list.length > MAX_BATCH_) fail(400, 'ออกเลขได้ครั้งละไม่เกิน ' + MAX_BATCH_ + ' ราย');
  if (list && !list.length) fail(400, 'กรุณาระบุผู้รับอย่างน้อย 1 ราย');
  var b = getBook(bookId);
  var base = cleanFields_(b.type, input);
  var rows = list ? list.map(function (r) { var d = Object.assign({}, base); d.recipient = r.slice(0, 300); return d; }) : [base];
  rows.forEach(function (d) { requireFields_(b.type, d); });
  var first = allocate_(b, rows.length);
  var now = bkkNow();
  var out = rows.map(function (data, i) {
    var no = first + i;
    if (b.type === 'send') data.doc_ref = sendRef(b, no);
    var e = Object.assign({
      book_id: b.id, no: no, entry_date: now.date, entry_time: now.time, status: 'filled', mode: 'issue',
      reserved_by: user.id, reserved_name: user.full_name, created_by: user.id, created_at: Date.now(), filled_at: Date.now(), updated_at: Date.now(), edit_count: 0,
    }, data);
    table_('Entries').insert(e);
    log_(e.id, user, 'issue', { no: no });
    return clean_(e);
  });
  return list ? out : out[0];
}

function reserve(bookId, user, opts) {
  opts = opts || {};
  var count = Math.floor(Number(opts.count) || 1);
  if (count < 1 || count > MAX_RESERVE_) fail(400, 'จองได้ครั้งละ 1–' + MAX_RESERVE_ + ' เลข');
  var name = String(opts.reservedName || user.full_name).trim().slice(0, 120);
  if (!name) fail(400, 'กรุณาลงชื่อผู้จอง');
  var b = getBook(bookId);
  var first = allocate_(b, count);
  var now = bkkNow();
  var out = [];
  for (var no = first; no < first + count; no++) {
    var e = {
      book_id: b.id, no: no, entry_date: now.date, entry_time: now.time, status: 'reserved', mode: 'reserve',
      reserved_by: user.id, reserved_name: name, subject: String(opts.subject || '').trim().slice(0, 300),
      doc_ref: b.type === 'send' ? sendRef(b, no) : '', created_by: user.id, created_at: Date.now(), updated_at: Date.now(), edit_count: 0,
    };
    table_('Entries').insert(e);
    log_(e.id, user, 'reserve', { no: no, name: name });
    out.push(clean_(e));
  }
  return out;
}

function canModify(e, user, isAdmin) {
  if (isAdmin) return true;
  if (!user) return false;
  return e.reserved_by === user.id || e.created_by === user.id;
}

function updateEntry(id, user, isAdmin, input) {
  var e = getEntry(id);
  if (e.status === 'cancelled') fail(400, 'เลขนี้ถูกยกเลิกแล้ว');
  if (!canModify(e, user, isAdmin)) fail(403, 'แก้ไขได้เฉพาะผู้ออกเลข/ผู้จอง หรือผู้ดูแลระบบ');
  var b = getBook(e.book_id);
  var data = cleanFields_(b.type, input);
  if (b.type === 'send') delete data.doc_ref;
  requireFields_(b.type, Object.assign({}, e, data));
  var E = table_('Entries');
  if (e.status === 'reserved') {
    // กรอกรายละเอียดของเลขที่จอง — ไม่นับเป็นการแก้ไข และคงวันที่จองไว้
    E.update(e, Object.assign({ status: 'filled', filled_at: Date.now(), updated_at: Date.now() }, data));
    log_(e.id, user, 'fill', null);
  } else {
    var changes = {}, any = false;
    for (var k in data) if (String(e[k] || '') !== data[k]) { changes[k] = [e[k] || '', data[k]]; any = true; }
    if (!any) return clean_(e);
    E.update(e, Object.assign({ updated_at: Date.now(), edit_count: e.edit_count + 1 }, data));
    log_(e.id, user, 'edit', changes);
  }
  return clean_(e);
}

function cancelEntry(id, user, isAdmin, reason) {
  var e = getEntry(id);
  if (e.status === 'cancelled') return clean_(e);
  if (!canModify(e, user, isAdmin)) fail(403, 'ยกเลิกได้เฉพาะผู้ออกเลข/ผู้จอง หรือผู้ดูแลระบบ');
  if (e.status === 'filled' && !isAdmin) fail(403, 'เลขที่ลงรายละเอียดแล้ว ยกเลิกได้โดยผู้ดูแลระบบเท่านั้น');
  var r = String(reason || '').trim().slice(0, 300);
  if (!r) fail(400, 'กรุณาระบุเหตุผลการยกเลิก');
  // ตามหลักงานสารบรรณ เลขที่ออกไปแล้วไม่นำกลับมาใช้ใหม่
  table_('Entries').update(e, { status: 'cancelled', cancel_reason: r, updated_at: Date.now() });
  log_(e.id, user, 'cancel', { reason: r });
  return clean_(e);
}

function sigImage_(s) {
  var out = '';
  for (var i = 1; i <= 12; i++) out += s['img' + i] || '';
  return out;
}

function entryDetail(id) {
  var e = clean_(getEntry(id));
  e.logs = table_('Logs').filter(function (l) { return l.entry_id === e.id; })
    .sort(function (a, b) { return a.at - b.at || a.id - b.id; })
    .map(function (l) { return { id: l.id, actor: l.actor, action: l.action, at: l.at, detail: l.detail ? JSON.parse(l.detail) : null }; });
  e.signatures = table_('Signatures').filter(function (s) { return s.entry_id === e.id; })
    .sort(function (a, b) { return a.signed_at - b.signed_at; })
    .map(function (s) { return { id: s.id, name: s.name, position: s.position, image: sigImage_(s), signed_at: s.signed_at }; });
  return e;
}

function addSignature(id, user, body) {
  var e = getEntry(id);
  var b = getBook(e.book_id);
  if (!BOOK_TYPES[b.type].canSign) fail(400, 'สมุดประเภทนี้ไม่มีการเซ็นรับ');
  if (e.status !== 'filled') fail(400, 'ต้องลงรายละเอียดหนังสือก่อนจึงจะเซ็นรับได้');
  var n = String(body.name || '').trim().slice(0, 120);
  if (!n) fail(400, 'กรุณาระบุชื่อผู้รับหนังสือ');
  var img = String(body.image || '');
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(img) || img.length < 200) fail(400, 'กรุณาเซ็นชื่อในช่องลายมือชื่อ');
  var CH = 45000;
  if (img.length > CH * 12) fail(400, 'ไฟล์ลายเซ็นใหญ่เกินไป');
  var s = { entry_id: e.id, user_id: user.id, name: n, position: String(body.position || '').trim().slice(0, 120), signed_at: Date.now() };
  for (var i = 0; i < 12; i++) s['img' + (i + 1)] = img.slice(i * CH, (i + 1) * CH);
  table_('Signatures').insert(s);
  log_(e.id, user, 'sign', { name: n });
  return s.id;
}

function suggestions(bookId) {
  var b = getBook(bookId);
  var es = table_('Entries').filter(function (e) { return e.book_id === b.id && e.status === 'filled'; })
    .sort(function (a, c) { return c.no - a.no; });
  var values = {};
  BOOK_TYPES[b.type].fields.forEach(function (f) {
    if (!f.suggest) return;
    var seen = {}, arr = [];
    es.forEach(function (e) { var v = e[f.key]; if (v && !seen[v] && arr.length < 40) { seen[v] = 1; arr.push(v); } });
    values[f.key] = arr;
  });
  var last = es[0] || null;
  var prev = null;
  if (last) { prev = {}; fieldsOf(b.type).forEach(function (k) { prev[k] = last[k] || ''; }); }
  return { values: values, last: prev, lastNo: last ? last.no : null };
}

// ----- 30_telegram.js -----
// =====================================================================
// Telegram Bot
// =====================================================================
function tgEsc_(s) { return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function tgConfigured() { return !!(getSetting('tgToken') && getSetting('tgChatId')); }

function tgCall(method, payload, token) {
  token = token || getSetting('tgToken');
  if (!token) throw new Error('ยังไม่ได้ตั้งค่า Bot Token');
  var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + method, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(payload || {}), muteHttpExceptions: true,
  });
  var json = {};
  try { json = JSON.parse(res.getContentText()); } catch (e) {}
  if (!json.ok) throw new Error(json.description || ('Telegram ตอบกลับ ' + res.getResponseCode()));
  return json.result;
}

function tgSend(html, buttons, fallbackText) {
  var chatId = getSetting('tgChatId');
  if (!chatId) throw new Error('ยังไม่ได้ตั้งค่า Chat ID');
  var base = { chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true };
  if (buttons && buttons.length) {
    try {
      return tgCall('sendMessage', Object.assign({}, base, { reply_markup: { inline_keyboard: buttons.map(function (b) { return [b]; }) } }));
    } catch (e) {
      if (!/url|button/i.test(e.message)) throw e;
    }
  }
  return tgCall('sendMessage', Object.assign({}, base, { text: html + (fallbackText || '') }));
}

/** ที่อยู่เว็บแอป (Apps Script สร้างให้อัตโนมัติ) */
function appUrl_() {
  var u = (getSetting('baseUrl') || '').replace(/\/+$/, '');
  if (u) return u;
  try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; }
}
function appLink_(page) {
  var u = appUrl_();
  if (!u) return '';
  return u + (u.indexOf('?') >= 0 ? '&' : '?') + 'p=' + encodeURIComponent(page).replace(/%2F/g, '/');
}

function buildDailyMessage() {
  var now = bkkNow();
  var org = getSetting('orgName');
  var books = table_('Books').filter(function (b) { return b.status === 'open'; })
    .sort(function (a, b) { return a.sort - b.sort || a.id - b.id; }).map(bookSummary);
  var fest = activeFestival(now.date);
  var lines = ['☀️ <b>อรุณสวัสดิ์ — สรุปเลขทะเบียนประจำวัน</b>', tgEsc_(thaiDate(now.date, { day: true })) + (org ? '\n🏛 ' + tgEsc_(org) : ''), ''];
  if (!books.length) lines.push('ยังไม่มีสมุดที่เปิดใช้งาน');
  books.forEach(function (b) {
    var t = BOOK_TYPES[b.type];
    lines.push('📒 <b>' + tgEsc_(b.name) + '</b>');
    lines.push('   เลขล่าสุด: <b>' + (b.last_no >= b.start_no ? b.last_no : '—') + '</b>   ถัดไป: <b>' + b.nextNo + '</b>' + (b.type === 'send' && b.prefix ? ' (' + tgEsc_(b.prefix) + b.nextNo + ')' : ''));
    if (b.last && b.last.entry_date) lines.push('   บันทึกล่าสุด: ' + tgEsc_(thaiDate(b.last.entry_date, { short: true })));
    if (b.name.indexOf(t.label) < 0) lines.push('   <i>' + tgEsc_(t.label) + '</i>');
  });
  if (fest) lines.push('', fest.emoji + ' ' + (fest.ongoing ? 'วันนี้' + tgEsc_(fest.name) : 'อีก ' + fest.daysLeft + ' วัน ถึง' + tgEsc_(fest.name)));
  var buttons = [], fallback = '';
  if (appUrl_()) {
    lines.push('', 'ต้องการจองเลขล่าสุด กดปุ่มด้านล่างเพื่อจอง 👇');
    books.forEach(function (b) {
      var link = appLink_('reserve/' + b.id);
      buttons.push({ text: ('🔖 จอง' + BOOK_TYPES[b.type].short + ' ' + b.nextNo + ' — ' + b.name).slice(0, 64), url: link });
      fallback += '\n🔖 <a href="' + tgEsc_(link) + '">จอง' + tgEsc_(BOOK_TYPES[b.type].short) + ' — ' + tgEsc_(b.name) + '</a>';
    });
    if (fallback) fallback = '\n' + fallback;
  }
  return { html: lines.join('\n'), buttons: buttons, fallback: fallback };
}

function sendDaily() {
  var m = buildDailyMessage();
  return tgSend(m.html, m.buttons, m.fallback);
}

function notifyNewMember(u) {
  if (!tgConfigured() || getSetting('notifyNewMember') !== '1') return;
  try {
    var link = appLink_('admin/members');
    tgSend('🆕 <b>มีผู้สมัครสมาชิกใหม่รออนุมัติ</b>\n' + tgEsc_(u.full_name) + (u.position ? ' (' + tgEsc_(u.position) + ')' : '') + '\nชื่อผู้ใช้: ' + tgEsc_(u.username),
      link ? [{ text: '✅ ไปหน้าอนุมัติสมาชิก', url: link }] : []);
  } catch (e) { console.warn('notifyNewMember', e); }
}

function notifyUpdate(pending) {
  if (!tgConfigured() || getSetting('notifyUpdate') !== '1') return;
  try {
    var link = appLink_('admin/system');
    tgSend('🛠 <b>มีอัพเดตระบบใหม่ ' + pending.length + ' รายการ</b> รอผู้ดูแลยืนยันการติดตั้ง\n' + pending.slice(0, 8).map(function (c) { return '• ' + tgEsc_(c.subject); }).join('\n'),
      link ? [{ text: '🔐 เปิดหน้าอัพเดต (ผู้ดูแล)', url: link }] : []);
  } catch (e) { console.warn('notifyUpdate', e); }
}

function detectChats(token) {
  var updates = tgCall('getUpdates', { limit: 50 }, token);
  var map = {};
  updates.forEach(function (u) {
    var c = (u.message && u.message.chat) || (u.my_chat_member && u.my_chat_member.chat) || (u.channel_post && u.channel_post.chat);
    if (c) map[c.id] = { id: String(c.id), title: c.title || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.username, type: c.type };
  });
  return Object.keys(map).map(function (k) { return map[k]; });
}

// ----- 40_scheduler.js -----
// =====================================================================
// ตัวตั้งเวลา (Time-driven triggers)
//  - dailyPlanner: ทำงานทุกเช้าราว 06:00–07:00 → วางนัดส่งแจ้งเตือนตรงเวลา (ค่าเริ่มต้น 08:30) เฉพาะจันทร์–ศุกร์
//  - sendDailyTrigger: ส่งสรุปเลขล่าสุดเข้า Telegram
// =====================================================================
var CATCH_UP_MINUTES_ = 150;
var TRIGGER_HANDLERS_ = ['dailyPlanner', 'sendDailyTrigger'];

function holidaysSet_() {
  var set = {};
  String(getSetting('holidays') || '').split(/[\s,]+/).forEach(function (s) { if (/^\d{4}-\d{2}-\d{2}$/.test(s)) set[s] = 1; });
  return set;
}

function dailyWanted_(now) {
  if (getSetting('notifyEnabled') !== '1' || !tgConfigured()) return false;
  if (now.dow < 1 || now.dow > 5) return false; // จันทร์–ศุกร์เท่านั้น
  if (holidaysSet_()[now.date]) return false;
  return getSetting('lastDaily') !== now.date;
}

/** เวลา HH:MM ของวันนี้ (เวลาไทย) เป็น Date */
function bkkTimeToday_(hhmm) {
  var now = bkkNow();
  var d = now.date.split('-').map(Number), t = String(hhmm || '08:30').split(':').map(Number);
  return new Date(Date.UTC(d[0], d[1] - 1, d[2], t[0] - 7, t[1], 0));
}

function removeTriggers_(handler) {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === handler) ScriptApp.deleteTrigger(t); });
}

function triggersInstalled() {
  return ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'dailyPlanner'; });
}

/** ติดตั้งตัวตั้งเวลา (เรียกตอนตั้งค่าครั้งแรก และปุ่มในหน้าผู้ดูแล) */
function installTriggers() {
  TRIGGER_HANDLERS_.forEach(removeTriggers_);
  ScriptApp.newTrigger('dailyPlanner').timeBased().everyDays(1).atHour(6).inTimezone('Asia/Bangkok').create();
  planToday_();
}

/** วางนัดส่งของวันนี้ใหม่ (เรียกเมื่อเปลี่ยนเวลาแจ้งเตือนด้วย) */
function planToday_() {
  removeTriggers_('sendDailyTrigger');
  var now = bkkNow();
  if (!dailyWanted_(now)) return 'ไม่มีนัดส่งวันนี้';
  var at = bkkTimeToday_(getSetting('notifyTime'));
  var late = (Date.now() - at.getTime()) / 60000;
  if (late > CATCH_UP_MINUTES_) return 'เลยเวลาส่งของวันนี้แล้ว';
  ScriptApp.newTrigger('sendDailyTrigger').timeBased().at(late > 0 ? new Date(Date.now() + 60e3) : at).create();
  return 'นัดส่ง ' + Utilities.formatDate(late > 0 ? new Date(Date.now() + 60e3) : at, 'Asia/Bangkok', 'HH:mm');
}

function dailyPlanner() {
  DBC_ = {};
  planToday_();
  try { cleanupSessions(); } catch (e) { console.warn(e); }
  try {
    var r = checkUpdate();
    if (r.isNew) notifyUpdate(r.pending);
  } catch (e) { console.warn('update check', e); }
}

function sendDailyTrigger() {
  removeTriggers_('sendDailyTrigger');
  withLock_(function () {
    var now = bkkNow();
    if (!dailyWanted_(now)) return;
    try {
      sendDaily();
      setSetting('lastDaily', now.date);
      setSetting('lastDailyResult', 'ส่งสำเร็จ ' + now.date + ' ' + now.time);
    } catch (e) {
      setSetting('lastDailyResult', 'ส่งไม่สำเร็จ ' + now.date + ' ' + now.time + ': ' + e.message);
      // ลองใหม่อีกครั้งใน 5 นาที (ภายในช่วงส่งย้อนหลัง)
      if ((Date.now() - bkkTimeToday_(getSetting('notifyTime')).getTime()) / 60000 < CATCH_UP_MINUTES_) {
        ScriptApp.newTrigger('sendDailyTrigger').timeBased().after(5 * 60e3).create();
      }
    }
  });
}

// ----- 50_updater.js -----
// =====================================================================
// ระบบอัพเดต (Apps Script API)
// ผู้พัฒนาส่งโค้ดใหม่และสร้าง "เวอร์ชัน" ไว้ (เช่น clasp push && clasp version "คำอธิบาย")
// → เวอร์ชันใหม่จะขึ้นมารอในหน้าผู้ดูแล และเว็บแอปจะเปลี่ยนไปใช้เวอร์ชันใหม่ก็ต่อเมื่อผู้ดูแลกดยืนยัน
// ต้องเปิด "Google Apps Script API" ที่ https://script.google.com/home/usersettings (บัญชีเจ้าของสคริปต์)
// =====================================================================
var APP_VERSION = "1.0.0";

function scriptApi_(method, path, body) {
  var res = UrlFetchApp.fetch('https://script.googleapis.com/v1/projects/' + ScriptApp.getScriptId() + path, {
    method: method, contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: body ? JSON.stringify(body) : undefined,
  });
  var json = {};
  try { json = JSON.parse(res.getContentText() || '{}'); } catch (e) {}
  if (res.getResponseCode() >= 300) {
    var msg = (json.error && json.error.message) || ('HTTP ' + res.getResponseCode());
    if (/has not been used|disabled|User has not enabled/i.test(msg)) msg = 'ยังไม่ได้เปิด Google Apps Script API — เจ้าของสคริปต์เปิดได้ที่ script.google.com/home/usersettings';
    throw new Error(msg);
  }
  return json;
}

/** รหัสการทำให้ใช้งานได้ (deployment) ของเว็บแอปที่กำลังใช้อยู่ */
function deploymentId_() {
  var id = getSetting('deploymentId');
  if (id) return id;
  var url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) {}
  var m = /\/s\/([^/]+)\/(exec|dev)/.exec(url);
  return m ? m[1] : '';
}

function listVersions_() {
  var out = [], token = '';
  do {
    var r = scriptApi_('get', '/versions?pageSize=50' + (token ? '&pageToken=' + encodeURIComponent(token) : ''));
    out = out.concat(r.versions || []);
    token = r.nextPageToken || '';
  } while (token);
  return out;
}

function updateStatus() {
  var info = { version: APP_VERSION, git: false, commit: null, branch: 'Google Apps Script', pending: [], lastCheck: getSetting('updateLastCheck'), dirty: false, note: '' };
  try { info.pending = JSON.parse(getSetting('updatePending') || '[]'); } catch (e) {}
  var dep = deploymentId_();
  if (!dep) { info.note = 'ยังไม่ได้ทำให้ใช้งานได้เป็นเว็บแอป (Deploy → New deployment → Web app)'; return info; }
  try {
    var d = scriptApi_('get', '/deployments/' + dep);
    var cur = d.deploymentConfig && d.deploymentConfig.versionNumber;
    info.git = true;
    info.commit = cur ? 'เวอร์ชันสคริปต์ ' + cur : 'HEAD (โหมดทดสอบ)';
    if (!cur) info.note = 'เว็บแอปนี้ผูกกับโค้ดล่าสุด (HEAD) จึงอัพเดตทันทีที่บันทึกโค้ด — ควร deploy แบบระบุเวอร์ชันเพื่อให้รอผู้ดูแลยืนยัน';
  } catch (e) {
    info.note = e.message;
  }
  return info;
}

/** ตรวจหาเวอร์ชันที่ใหม่กว่าเวอร์ชันที่เว็บแอปใช้อยู่ — เก็บไว้รอผู้ดูแลยืนยัน */
function checkUpdate() {
  var dep = deploymentId_();
  if (!dep) throw new Error('ยังไม่ได้ deploy เป็นเว็บแอป');
  var d = scriptApi_('get', '/deployments/' + dep);
  var cur = Number(d.deploymentConfig && d.deploymentConfig.versionNumber) || 0;
  var pending = cur ? listVersions_().filter(function (v) { return Number(v.versionNumber) > cur; })
    .sort(function (a, b) { return b.versionNumber - a.versionNumber; })
    .map(function (v) { return { hash: 'v' + v.versionNumber, version: Number(v.versionNumber), subject: v.description || ('เวอร์ชัน ' + v.versionNumber), author: '', date: v.createTime }; }) : [];
  var prev = getSetting('updatePending');
  setSetting('updatePending', JSON.stringify(pending));
  setSetting('updateLastCheck', String(Date.now()));
  return { pending: pending, isNew: pending.length > 0 && prev !== JSON.stringify(pending) };
}

/** ติดตั้งอัพเดต: สำรองสเปรดชีต แล้วเปลี่ยนเว็บแอปไปใช้เวอร์ชันล่าสุด */
function applyUpdate() {
  var dep = deploymentId_();
  if (!dep) throw new Error('ยังไม่ได้ deploy เป็นเว็บแอป');
  var r = checkUpdate();
  if (!r.pending.length) throw new Error('ไม่มีเวอร์ชันใหม่ให้ติดตั้ง');
  var target = r.pending[0].version;
  var d = scriptApi_('get', '/deployments/' + dep);
  var before = d.deploymentConfig.versionNumber;
  var stamp = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HHmm');
  ss_().copy('สำรองก่อนอัพเดต ' + stamp + ' — ' + ss_().getName());
  scriptApi_('put', '/deployments/' + dep, {
    deploymentConfig: { scriptId: ScriptApp.getScriptId(), versionNumber: target, manifestFileName: 'appsscript', description: d.deploymentConfig.description || 'สมุดคุมเลขสารบรรณ' },
  });
  setSetting('updatePending', '[]');
  return { before: 'v' + before, after: 'v' + target, restarting: false, reloadHint: 'ติดตั้งแล้ว กรุณารีเฟรชหน้าเว็บเพื่อใช้เวอร์ชันใหม่' };
}

// ----- 90_api.js -----
// =====================================================================
// เว็บแอป + API (หน้าเว็บเรียกผ่าน google.script.run.api(method, path, body, token))
// =====================================================================
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('สมุดคุมเลขสารบรรณ')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

var ROUTES_ = [];
function route_(method, pattern, handler, opts) {
  var keys = [];
  var re = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/:(\w+)/g, function (_, k) { keys.push(k); return '([^/]+)'; }) + '/?$');
  ROUTES_.push({ method: method, re: re, keys: keys, handler: handler, write: method !== 'GET' || (opts && opts.write) });
}
function query_(qs) {
  var map = {};
  String(qs || '').split('&').forEach(function (p) {
    if (!p) return;
    var i = p.indexOf('=');
    var k = decodeURIComponent((i < 0 ? p : p.slice(0, i)).replace(/\+/g, ' '));
    map[k] = i < 0 ? '' : decodeURIComponent(p.slice(i + 1).replace(/\+/g, ' '));
  });
  return { get: function (k) { return map[k] === undefined ? null : map[k]; } };
}

/** จุดเข้าเดียวของหน้าเว็บ */
function api(method, fullPath, body, token) {
  try {
    var parts = String(fullPath).split('?');
    var path = parts[0];
    var m = null, params = {};
    for (var i = 0; i < ROUTES_.length; i++) {
      var r = ROUTES_[i];
      if (r.method !== method) continue;
      var x = r.re.exec(path);
      if (x) { m = r; r.keys.forEach(function (k, j) { params[k] = decodeURIComponent(x[j + 1]); }); break; }
    }
    if (!m) return { __error: 'ไม่พบ API', status: 404 };
    var run = function () {
      DBC_ = {};
      var ctx = { params: params, query: query_(parts[1]), body: body || {}, auth: loadAuth(token) };
      var out = m.handler(ctx);
      return out === undefined || out === null ? { ok: true } : out;
    };
    var result = m.write ? withLock_(run) : run();
    return JSON.parse(JSON.stringify(result)); // ให้แน่ใจว่าส่งกลับได้ (ไม่มี Date/undefined)
  } catch (e) {
    if (e.httpStatus) return { __error: e.message, status: e.httpStatus };
    console.error(e && e.stack || e);
    return { __error: (e && e.message) || 'เกิดข้อผิดพลาดภายในระบบ', status: 500 };
  }
}

function str_(v, max) { return String(v === undefined || v === null ? '' : v).trim().slice(0, max || 200); }
function canView_(ctx) { if (!ctx.auth.isAdmin) requireUser(ctx); }
function users_() { return table_('Users'); }

// ---------------- ทั่วไป ----------------
route_('GET', '/api/bootstrap', function (ctx) {
  var today = bkkNow().date;
  return {
    setupDone: isSetupDone(), orgName: getSetting('orgName'), user: publicUser(ctx.auth.user), isAdmin: ctx.auth.isAdmin, today: today,
    festival: { auto: getSetting('festivalAuto') === '1', force: getSetting('festivalForce') || null, active: activeFestival(today) },
    version: APP_VERSION, platform: 'gas',
  };
});

route_('POST', '/api/setup', function (ctx) {
  if (isSetupDone()) fail(400, 'ระบบถูกตั้งค่าแล้ว');
  var b = ctx.body;
  if (!str_(b.orgName)) fail(400, 'กรุณาระบุชื่อหน่วยงาน');
  if (b.pin !== b.pin2) fail(400, 'PIN ยืนยันไม่ตรงกัน');
  setAdminPin(b.pin);
  setSetting('orgName', str_(b.orgName));
  var B = table_('Books');
  if (!B.all().length) {
    var year = toBE(bkkNow().year);
    B.insert({ type: 'receive', name: 'ทะเบียนหนังสือรับ ปี ' + year, year: year, prefix: '', start_no: 1, last_no: 0, color: '#2f6fde', status: 'open', sort: 1, created_at: Date.now() });
    B.insert({ type: 'send', name: 'ทะเบียนหนังสือส่ง ปี ' + year, year: year, prefix: '', start_no: 1, last_no: 0, color: '#d9772b', status: 'open', sort: 2, created_at: Date.now() });
    B.insert({ type: 'petition', name: 'สมุดคุมเลขรับคำร้องทั่วไป ปี ' + year, year: year, prefix: '', start_no: 1, last_no: 0, color: '#1f9e74', status: 'open', sort: 3, created_at: Date.now() });
  }
  ['Users', 'Entries', 'Logs', 'Signatures', 'Sessions'].forEach(table_);
  var def = ss_().getSheetByName('Sheet1') || ss_().getSheetByName('แผ่น1') || ss_().getSheetByName('ชีต1');
  if (def && ss_().getSheets().length > 1 && def.getLastRow() === 0) ss_().deleteSheet(def);
  try { installTriggers(); } catch (e) { console.warn('installTriggers', e); }
  var token = elevate(ctx);
  return token ? { ok: true, __token: token } : { ok: true };
});

route_('POST', '/api/register', function (ctx) {
  if (!isSetupDone()) fail(400, 'ระบบยังไม่ได้ตั้งค่าเริ่มต้น');
  var b = ctx.body;
  var username = str_(b.username, 40).toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) fail(400, 'ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - อย่างน้อย 3 ตัว');
  if (String(b.password || '').length < 6) fail(400, 'รหัสผ่านอย่างน้อย 6 ตัวอักษร');
  if (!str_(b.fullName)) fail(400, 'กรุณากรอกชื่อ-นามสกุล');
  if (users_().find(function (u) { return u.username.toLowerCase() === username; })) fail(409, 'ชื่อผู้ใช้นี้ถูกใช้แล้ว');
  var u = users_().insert({ username: username, pass: hashSecret(b.password), full_name: str_(b.fullName, 120), position: str_(b.position, 120), department: str_(b.department, 120), phone: str_(b.phone, 40), status: 'pending', prefs: '{}', created_at: Date.now() });
  notifyNewMember(u);
  return { ok: true, status: 'pending' };
});

route_('POST', '/api/login', function (ctx) {
  var name = str_(ctx.body.username, 40).toLowerCase();
  var u = users_().find(function (x) { return x.username.toLowerCase() === name; });
  if (!u || !verifySecret(ctx.body.password || '', u.pass)) fail(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  if (u.status === 'pending') fail(403, 'บัญชีของคุณกำลังรอผู้ดูแลระบบอนุมัติ');
  if (u.status === 'rejected') fail(403, 'คำขอสมัครสมาชิกไม่ได้รับการอนุมัติ');
  if (u.status === 'disabled') fail(403, 'บัญชีถูกระงับการใช้งาน');
  var adminUntil = ctx.auth.isAdmin ? ctx.auth.session.admin_until : 0;
  if (ctx.auth.session) table_('Sessions').remove(ctx.auth.session);
  var token = createSession(u.id, adminUntil);
  users_().update(u, { last_login: Date.now() });
  return { ok: true, user: publicUser(u), __token: token };
});

route_('POST', '/api/logout', function (ctx) {
  if (ctx.auth.session) table_('Sessions').remove(ctx.auth.session);
  return { ok: true, __token: '' };
});

route_('PUT', '/api/me/prefs', function (ctx) {
  var u = requireUser(ctx);
  var prefs = {};
  try { prefs = JSON.parse(u.prefs || '{}'); } catch (e) {}
  ['theme', 'sound', 'soundVolume', 'festival', 'particles', 'density'].forEach(function (k) { if (ctx.body[k] !== undefined) prefs[k] = ctx.body[k]; });
  users_().update(u, { prefs: JSON.stringify(prefs).slice(0, 2000) });
  return { ok: true, prefs: prefs };
});

route_('PUT', '/api/me/profile', function (ctx) {
  var u = requireUser(ctx), b = ctx.body;
  if (!str_(b.fullName)) fail(400, 'กรุณากรอกชื่อ-นามสกุล');
  users_().update(u, { full_name: str_(b.fullName, 120), position: str_(b.position, 120), department: str_(b.department, 120), phone: str_(b.phone, 40) });
  return { ok: true };
});

route_('PUT', '/api/me/password', function (ctx) {
  var u = requireUser(ctx);
  if (!verifySecret(ctx.body.current || '', u.pass)) fail(400, 'รหัสผ่านเดิมไม่ถูกต้อง');
  if (String(ctx.body.next || '').length < 6) fail(400, 'รหัสผ่านใหม่อย่างน้อย 6 ตัวอักษร');
  users_().update(u, { pass: hashSecret(ctx.body.next) });
  return { ok: true };
});

// ---------------- สมุด / เลข ----------------
function sortedBooks_() {
  return table_('Books').all().slice().sort(function (a, b) {
    return ((a.status === 'closed') - (b.status === 'closed')) || (a.sort - b.sort) || (b.year - a.year) || (a.id - b.id);
  });
}

route_('GET', '/api/books', function (ctx) { canView_(ctx); return sortedBooks_().map(bookSummary); });
route_('GET', '/api/books/:id', function (ctx) { canView_(ctx); return bookSummary(getBook(ctx.params.id)); });
route_('GET', '/api/books/:id/suggest', function (ctx) { canView_(ctx); return suggestions(ctx.params.id); });

route_('GET', '/api/books/:id/entries', function (ctx) {
  canView_(ctx);
  var b = getBook(ctx.params.id), q = ctx.query;
  var signCount = {};
  table_('Signatures').all().forEach(function (s) { signCount[s.entry_id] = (signCount[s.entry_id] || 0) + 1; });
  var st = q.get('status'), month = q.get('month') || '', text = str_(q.get('q'), 100).toLowerCase();
  var mine = q.get('mine') === '1' && ctx.auth.user ? ctx.auth.user.id : null;
  var rows = table_('Entries').filter(function (e) {
    if (e.book_id !== b.id) return false;
    if (['reserved', 'filled', 'cancelled'].indexOf(st) >= 0 && e.status !== st) return false;
    if (q.get('unsigned') === '1' && (e.status !== 'filled' || signCount[e.id])) return false;
    if (/^\d{4}-\d{2}$/.test(month) && e.entry_date.slice(0, 7) !== month) return false;
    if (mine && e.reserved_by !== mine && e.created_by !== mine) return false;
    if (text) {
      if (String(e.no) === text) return true;
      var hay = ['doc_ref', 'sender', 'recipient', 'subject', 'action', 'note', 'petitioner', 'contact', 'reserved_name'].map(function (k) { return e[k] || ''; }).join('\n').toLowerCase();
      if (hay.indexOf(text) < 0) return false;
    }
    return true;
  });
  var asc = q.get('order') === 'asc';
  rows.sort(function (a, c) { return asc ? a.no - c.no : c.no - a.no; });
  var limit = Math.min(500, Math.max(10, Number(q.get('limit')) || 100));
  var page = Math.max(0, Number(q.get('page')) || 0);
  var slice = rows.slice(page * limit, page * limit + limit).map(function (e) {
    var o = clean_(e);
    o.sign_count = signCount[e.id] || 0;
    o.canEdit = canModify(e, ctx.auth.user, ctx.auth.isAdmin) && e.status !== 'cancelled';
    return o;
  });
  return { book: bookSummary(b), total: rows.length, page: page, limit: limit, rows: slice, uid: ctx.auth.user ? ctx.auth.user.id : null };
});

route_('POST', '/api/books/:id/issue', function (ctx) { return issueNow(ctx.params.id, requireUser(ctx), ctx.body); });
route_('POST', '/api/books/:id/reserve', function (ctx) { return reserve(ctx.params.id, requireUser(ctx), ctx.body); });

route_('GET', '/api/entries/:id', function (ctx) {
  canView_(ctx);
  var e = entryDetail(ctx.params.id);
  e.canEdit = canModify(e, ctx.auth.user, ctx.auth.isAdmin) && e.status !== 'cancelled';
  e.book = bookSummary(getBook(e.book_id));
  return e;
});
route_('PUT', '/api/entries/:id', function (ctx) {
  if (!ctx.auth.isAdmin) requireUser(ctx);
  return updateEntry(ctx.params.id, ctx.auth.user, ctx.auth.isAdmin, ctx.body);
});
route_('POST', '/api/entries/:id/cancel', function (ctx) {
  if (!ctx.auth.isAdmin) requireUser(ctx);
  return cancelEntry(ctx.params.id, ctx.auth.user, ctx.auth.isAdmin, ctx.body.reason);
});
route_('POST', '/api/entries/:id/sign', function (ctx) { return { id: addSignature(ctx.params.id, requireUser(ctx), ctx.body) }; });
route_('DELETE', '/api/signatures/:id', function (ctx) {
  requireAdmin(ctx);
  var s = table_('Signatures').byId(ctx.params.id);
  if (!s) fail(404, 'ไม่พบลายเซ็น');
  log_(s.entry_id, null, 'unsign', { name: s.name });
  table_('Signatures').remove(s);
  return { ok: true };
});

/** จุดแดง: เลขที่จองค้าง (แสดงในระบบเท่านั้น ไม่ส่งแจ้งเตือนบอท) */
route_('GET', '/api/badges', function (ctx) {
  canView_(ctx);
  var uid = ctx.auth.user ? ctx.auth.user.id : -1;
  var perBook = {}, mine = 0, total = 0;
  table_('Entries').all().forEach(function (e) {
    if (e.status !== 'reserved') return;
    perBook[e.book_id] = (perBook[e.book_id] || 0) + 1;
    total++;
    if (e.reserved_by === uid) mine++;
  });
  var pendingMembers = ctx.auth.isAdmin ? users_().filter(function (u) { return u.status === 'pending'; }).length : 0;
  var updates = 0;
  if (ctx.auth.isAdmin) try { updates = JSON.parse(getSetting('updatePending') || '[]').length; } catch (e) {}
  return { perBook: perBook, mine: mine, total: total, pendingMembers: pendingMembers, updates: updates };
});

route_('GET', '/api/reservations/mine', function (ctx) {
  var u = requireUser(ctx);
  var books = {};
  table_('Books').all().forEach(function (b) { books[b.id] = b; });
  return table_('Entries').filter(function (e) { return e.status === 'reserved' && e.reserved_by === u.id; })
    .sort(function (a, b) { return a.entry_date.localeCompare(b.entry_date) || a.no - b.no; })
    .map(function (e) { var o = clean_(e), b = books[e.book_id] || {}; o.book_name = b.name; o.book_type = b.type; o.book_year = b.year; return o; });
});

route_('GET', '/api/books/:id/export.csv', function (ctx) {
  canView_(ctx);
  var b = getBook(ctx.params.id), t = BOOK_TYPES[b.type];
  var cols = [['no', t.noLabel], ['entry_date', t.dateLabel], ['entry_time', 'เวลา']]
    .concat(t.fields.map(function (f) { return [f.key, f.label]; }))
    .concat([['status', 'สถานะ'], ['reserved_name', 'ผู้ออกเลข/ผู้จอง'], ['edit_count', 'จำนวนครั้งที่แก้ไข'], ['cancel_reason', 'เหตุผลยกเลิก']]);
  if (b.type === 'send') cols.splice(1, 0, ['doc_ref', 'ที่']);
  var label = { reserved: 'จองไว้', filled: 'บันทึกแล้ว', cancelled: 'ยกเลิก' };
  var esc = function (v) { return '"' + String(v === null || v === undefined ? '' : v).replace(/"/g, '""') + '"'; };
  var lines = [cols.map(function (c) { return esc(c[1]); }).join(',')];
  table_('Entries').filter(function (e) { return e.book_id === b.id; }).sort(function (a, c) { return a.no - c.no; })
    .forEach(function (e) { lines.push(cols.map(function (c) { return esc(c[0] === 'status' ? label[e.status] : e[c[0]]); }).join(',')); });
  return { text: '\uFEFF' + lines.join('\r\n'), type: 'text/csv;charset=utf-8', filename: b.name + '.csv' };
});

// ---------------- ผู้ดูแลระบบ (PIN) ----------------
route_('POST', '/api/admin/unlock', function (ctx) {
  if (!isSetupDone()) fail(400, 'ระบบยังไม่ได้ตั้งค่า');
  checkPin(ctx.body.pin);
  var token = elevate(ctx);
  return token ? { ok: true, __token: token } : { ok: true };
});
route_('POST', '/api/admin/lock', function (ctx) {
  var s = ctx.auth.session;
  if (s) { if (ctx.auth.user) table_('Sessions').update(s, { admin_until: 0 }); else { table_('Sessions').remove(s); return { ok: true, __token: '' }; } }
  return { ok: true };
});
route_('PUT', '/api/admin/pin', function (ctx) {
  requireAdmin(ctx);
  checkPin(ctx.body.current);
  if (!validPin(ctx.body.next)) fail(400, 'PIN ใหม่ต้องเป็นตัวเลข 6–8 หลัก');
  if (ctx.body.next !== ctx.body.next2) fail(400, 'PIN ยืนยันไม่ตรงกัน');
  setAdminPin(ctx.body.next);
  return { ok: true };
});

route_('GET', '/api/admin/users', function (ctx) {
  requireAdmin(ctx);
  var rank = { pending: 0, active: 1 };
  return users_().all().slice().sort(function (a, b) {
    return ((rank[a.status] === undefined ? 2 : rank[a.status]) - (rank[b.status] === undefined ? 2 : rank[b.status])) || (b.created_at - a.created_at);
  }).map(clean_);
});
route_('POST', '/api/admin/users/:id/:action', function (ctx) {
  requireAdmin(ctx);
  var u = users_().byId(ctx.params.id);
  if (!u) fail(404, 'ไม่พบสมาชิก');
  var a = ctx.params.action;
  if (a === 'approve' || a === 'enable') users_().update(u, { status: 'active', approved_at: u.approved_at || Date.now() });
  else if (a === 'reject') users_().update(u, { status: 'rejected' });
  else if (a === 'disable') {
    users_().update(u, { status: 'disabled' });
    var S = table_('Sessions');
    S.filter(function (s) { return s.user_id === u.id; }).sort(function (x, y) { return y.__r - x.__r; }).forEach(function (s) { S.sheet.deleteRow(s.__r); });
    DBC_.Sessions = null;
  } else if (a === 'reset-password') {
    var pw = String(ctx.body.password || '');
    if (pw.length < 6) fail(400, 'รหัสผ่านอย่างน้อย 6 ตัวอักษร');
    users_().update(u, { pass: hashSecret(pw) });
  } else if (a === 'delete') {
    if (table_('Entries').find(function (e) { return e.reserved_by === u.id || e.created_by === u.id; })) fail(400, 'สมาชิกนี้มีประวัติการออกเลขแล้ว ใช้ "ระงับ" แทนการลบ');
    users_().remove(u);
  } else fail(400, 'คำสั่งไม่ถูกต้อง');
  return { ok: true };
});

function bookInput_(b, existing) {
  var out = {};
  if (!existing) { if (!BOOK_TYPES[b.type]) fail(400, 'ประเภทสมุดไม่ถูกต้อง'); out.type = b.type; }
  var pick = function (k, d) { return b[k] !== undefined ? b[k] : (existing && existing[k] !== undefined ? existing[k] : d); };
  out.name = str_(pick('name', ''), 150);
  if (!out.name) fail(400, 'กรุณาตั้งชื่อสมุด');
  out.year = Math.floor(Number(pick('year', 0)));
  if (!(out.year > 2400 && out.year < 2700)) fail(400, 'ปี พ.ศ. ไม่ถูกต้อง');
  out.prefix = str_(pick('prefix', ''), 60);
  out.start_no = Math.max(1, Math.floor(Number(pick('start_no', 1))) || 1);
  out.color = /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : ((existing && existing.color) || '#2f6fde');
  out.sort = Math.floor(Number(pick('sort', 0))) || 0;
  return out;
}
function bookUsed_(id) { return !!table_('Entries').find(function (e) { return e.book_id === id; }); }

route_('POST', '/api/admin/books', function (ctx) {
  requireAdmin(ctx);
  var d = bookInput_(ctx.body);
  d.last_no = 0; d.status = 'open'; d.created_at = Date.now();
  return bookSummary(table_('Books').insert(d));
});
route_('PUT', '/api/admin/books/:id', function (ctx) {
  requireAdmin(ctx);
  var b = getBook(ctx.params.id);
  var d = bookInput_(ctx.body, b);
  if (bookUsed_(b.id) && d.start_no !== b.start_no) fail(400, 'สมุดที่มีการออกเลขแล้ว เปลี่ยนเลขเริ่มต้นไม่ได้');
  return bookSummary(table_('Books').update(b, d));
});
route_('POST', '/api/admin/books/:id/close', function (ctx) {
  requireAdmin(ctx);
  var b = getBook(ctx.params.id);
  return bookSummary(table_('Books').update(b, { status: b.status === 'open' ? 'closed' : 'open' }));
});
route_('POST', '/api/admin/books/:id/rollover', function (ctx) {
  requireAdmin(ctx);
  var b = getBook(ctx.params.id);
  var year = Math.max(b.year + 1, toBE(bkkNow().year));
  var name = b.name.indexOf(String(b.year)) >= 0 ? b.name.replace(String(b.year), String(year)) : b.name + ' ปี ' + year;
  var n = table_('Books').insert({ type: b.type, name: name, year: year, prefix: b.prefix, start_no: 1, last_no: 0, color: b.color, status: 'open', sort: b.sort, created_at: Date.now() });
  table_('Books').update(b, { status: 'closed' });
  return bookSummary(n);
});
route_('DELETE', '/api/admin/books/:id', function (ctx) {
  requireAdmin(ctx);
  var b = getBook(ctx.params.id);
  if (bookUsed_(b.id)) fail(400, 'สมุดที่มีการออกเลขแล้วลบไม่ได้ ใช้ "ปิดเล่ม" แทน');
  table_('Books').remove(b);
  return { ok: true };
});

var ADMIN_SETTINGS_ = ['orgName', 'tgToken', 'tgChatId', 'baseUrl', 'notifyEnabled', 'notifyTime', 'notifyNewMember', 'notifyUpdate', 'holidays', 'festivalAuto', 'festivalForce'];
route_('GET', '/api/admin/settings', function (ctx) {
  requireAdmin(ctx);
  var out = {};
  ADMIN_SETTINGS_.forEach(function (k) { out[k] = getSetting(k); });
  out.tgToken = out.tgToken ? out.tgToken.replace(/:(.{4}).+$/, ':$1••••••••') : '';
  out.lastDaily = getSetting('lastDaily');
  var trig = false;
  try { trig = triggersInstalled(); } catch (e) {}
  out.lastDailyResult = (getSetting('lastDailyResult') || '') + (trig ? '' : ' (ยังไม่ได้ติดตั้งตัวตั้งเวลา — กด "ติดตั้งตัวตั้งเวลา")');
  out.triggers = trig;
  out.appUrl = appUrl_();
  out.sheetUrl = ss_().getUrl();
  return out;
});
route_('PUT', '/api/admin/settings', function (ctx) {
  requireAdmin(ctx);
  var b = ctx.body, replan = false;
  ADMIN_SETTINGS_.forEach(function (k) {
    if (b[k] === undefined) return;
    var v = String(b[k]).trim();
    if (k === 'tgToken' && v.indexOf('••') >= 0) return;
    if (k === 'notifyTime' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) fail(400, 'รูปแบบเวลาไม่ถูกต้อง (HH:MM)');
    if (k === 'baseUrl' && v && !/^https?:\/\/\S+$/i.test(v)) fail(400, 'ที่อยู่เว็บต้องขึ้นต้นด้วย http:// หรือ https://');
    if (['notifyEnabled', 'notifyNewMember', 'notifyUpdate', 'festivalAuto'].indexOf(k) >= 0) v = (v === '1' || v === 'true') ? '1' : '0';
    if (k === 'orgName' && !v) fail(400, 'กรุณาระบุชื่อหน่วยงาน');
    if (['notifyTime', 'notifyEnabled', 'holidays', 'tgToken', 'tgChatId'].indexOf(k) >= 0 && getSetting(k) !== v) replan = true;
    setSetting(k, v.slice(0, 4000));
  });
  var plan = '';
  if (replan) try { plan = triggersInstalled() ? planToday_() : ''; } catch (e) { plan = e.message; }
  return { ok: true, plan: plan };
});
route_('POST', '/api/admin/triggers', function (ctx) { requireAdmin(ctx); installTriggers(); return { ok: true }; });

route_('POST', '/api/admin/telegram/detect', function (ctx) {
  requireAdmin(ctx);
  var t = str_(ctx.body.token, 200);
  return detectChats(t && t.indexOf('••') < 0 ? t : undefined);
});
route_('POST', '/api/admin/telegram/test', function (ctx) {
  requireAdmin(ctx);
  var me = tgCall('getMe');
  tgSend('✅ ทดสอบการเชื่อมต่อจากระบบสมุดคุมเลข\nบอท: @' + me.username);
  return { ok: true, bot: me.username };
});
route_('POST', '/api/admin/telegram/daily', function (ctx) { requireAdmin(ctx); sendDaily(); return { ok: true }; });
route_('GET', '/api/admin/telegram/preview', function (ctx) { requireAdmin(ctx); return buildDailyMessage(); });

route_('GET', '/api/admin/update', function (ctx) { requireAdmin(ctx); return updateStatus(); });
route_('POST', '/api/admin/update/check', function (ctx) { requireAdmin(ctx); checkUpdate(); return updateStatus(); });
route_('POST', '/api/admin/update/apply', function (ctx) { requireAdmin(ctx); return applyUpdate(); });

route_('GET', '/api/admin/backup', function (ctx) {
  requireAdmin(ctx);
  var stamp = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HHmm');
  var copy = ss_().copy('สำรอง ' + stamp + ' — ' + ss_().getName());
  return { __link: copy.getUrl() };
}, { write: true });

// ภาพรวมสำหรับผู้ดูแล: สถิติ งานค้าง และประวัติการใช้งานล่าสุดทั้งระบบ
route_('GET', '/api/admin/overview', function (ctx) {
  requireAdmin(ctx);
  var today = bkkNow().date;
  var books = {};
  table_('Books').all().forEach(function (b) { books[b.id] = b; });
  var entries = table_('Entries').all();
  var byId = {};
  entries.forEach(function (e) { byId[e.id] = e; });
  var signed = {};
  table_('Signatures').all().forEach(function (s) { signed[s.entry_id] = 1; });
  var users = users_().all();
  var counts = {
    members: users.filter(function (u) { return u.status === 'active'; }).length,
    pendingMembers: users.filter(function (u) { return u.status === 'pending'; }).length,
    openBooks: table_('Books').filter(function (b) { return b.status === 'open'; }).length,
    entries: entries.length,
    today: entries.filter(function (e) { return e.entry_date === today; }).length,
    reserved: entries.filter(function (e) { return e.status === 'reserved'; }).length,
    unsigned: entries.filter(function (e) { var b = books[e.book_id]; return b && b.type === 'receive' && e.status === 'filled' && !signed[e.id]; }).length,
  };
  var withBook = function (o, e) { var b = books[e.book_id] || {}; o.book_name = b.name; o.book_type = b.type; o.book_year = b.year; return o; };
  var reservations = entries.filter(function (e) { return e.status === 'reserved'; })
    .sort(function (a, b) { return a.entry_date.localeCompare(b.entry_date) || a.no - b.no; }).slice(0, 100)
    .map(function (e) { return withBook({ id: e.id, no: e.no, entry_date: e.entry_date, entry_time: e.entry_time, reserved_name: e.reserved_name, subject: e.subject }, e); });
  var activity = table_('Logs').all().slice().sort(function (a, b) { return b.at - a.at || b.id - a.id; }).slice(0, 60)
    .filter(function (l) { return byId[l.entry_id]; })
    .map(function (l) { var e = byId[l.entry_id]; return withBook({ id: l.id, actor: l.actor, action: l.action, at: l.at, detail: l.detail, entry_id: e.id, no: e.no }, e); });
  var updates = 0;
  try { updates = JSON.parse(getSetting('updatePending') || '[]').length; } catch (e) {}
  var trig = false;
  try { trig = triggersInstalled(); } catch (e) {}
  return {
    today: today, counts: counts, reservations: reservations, activity: activity, updates: updates,
    telegram: { configured: tgConfigured(), enabled: getSetting('notifyEnabled') === '1', time: getSetting('notifyTime'), last: getSetting('lastDailyResult'), triggers: trig },
  };
});
