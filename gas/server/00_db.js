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
