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
