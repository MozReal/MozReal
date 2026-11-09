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
