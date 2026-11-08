// ตรรกะการออกเลข/จองเลข ของสมุดแต่ละเล่ม (แต่ละเล่มมีลำดับเลขของตัวเอง)
import { db, tx } from './db.js';
import { fail } from './http.js';
import { BOOK_TYPES, fieldsOf, sendRef } from '../public/js/shared/schema.js';
import { bkkNow, toBE } from '../public/js/shared/thaidate.js';

const MAX_RESERVE = 20;

export function getBook(id) {
  const b = db.prepare('SELECT * FROM books WHERE id = ?').get(id);
  if (!b) fail(404, 'ไม่พบสมุด');
  return b;
}

export function bookSummary(b) {
  const pending = db.prepare("SELECT COUNT(*) c FROM entries WHERE book_id = ? AND status = 'reserved'").get(b.id).c;
  const total = db.prepare('SELECT COUNT(*) c FROM entries WHERE book_id = ?').get(b.id).c;
  const last = db.prepare('SELECT no, entry_date, subject, status FROM entries WHERE book_id = ? ORDER BY no DESC LIMIT 1').get(b.id);
  const today = bkkNow().date;
  const todayCount = db.prepare('SELECT COUNT(*) c FROM entries WHERE book_id = ? AND entry_date = ?').get(b.id, today).c;
  const unsigned = b.type === 'receive'
    ? db.prepare("SELECT COUNT(*) c FROM entries e WHERE e.book_id = ? AND e.status = 'filled' AND NOT EXISTS (SELECT 1 FROM signatures s WHERE s.entry_id = e.id)").get(b.id).c
    : 0;
  return {
    ...b,
    typeLabel: BOOK_TYPES[b.type].label,
    nextNo: nextNo(b),
    pending, total, todayCount, unsigned,
    last: last || null,
    yearMismatch: b.status === 'open' && b.year !== toBE(bkkNow().year),
  };
}

export const nextNo = (b) => Math.max(b.last_no, b.start_no - 1) + 1;

function cleanFields(type, input) {
  const out = {};
  for (const k of fieldsOf(type)) {
    if (input[k] === undefined) continue;
    const v = String(input[k] ?? '').trim().slice(0, k === 'note' || k === 'action' || k === 'subject' ? 2000 : 300);
    out[k] = v;
  }
  if (out.doc_date && !/^\d{4}-\d{2}-\d{2}$/.test(out.doc_date)) out.doc_date = '';
  return out;
}

function requireFields(type, data) {
  for (const f of BOOK_TYPES[type].fields) {
    if (f.required && !String(data[f.key] || '').trim()) fail(400, `กรุณากรอก "${f.label}"`);
  }
}

export function log(entryId, user, action, detail) {
  db.prepare('INSERT INTO entry_logs(entry_id, user_id, actor, action, detail, at) VALUES (?,?,?,?,?,?)')
    .run(entryId, user?.id ?? null, user ? user.full_name : 'ผู้ดูแลระบบ', action, detail ? JSON.stringify(detail) : null, Date.now());
}

function allocate(book, count) {
  const fresh = getBook(book.id);
  if (fresh.status !== 'open') fail(400, 'สมุดเล่มนี้ปิดแล้ว');
  const first = nextNo(fresh);
  const last = first + count - 1;
  db.prepare('UPDATE books SET last_no = ? WHERE id = ?').run(last, book.id);
  return { first, last, book: fresh };
}

const MAX_BATCH = 50;

/**
 * ออกเลขทันที พร้อมรายละเอียด
 * input.recipients (อาร์เรย์) = ส่งเรื่องเดียวกันถึงหลายราย → ออกเลขเรียงกัน 1 รายต่อ 1 เลข
 * (ตรงกับการใช้งานจริงที่ลงทะเบียนส่งเรื่องเดียวกันถึงหลายหน่วยงานต่อเนื่องกัน)
 * คืนค่ารายการเดียว หรืออาร์เรย์เมื่อออกหลายเลข
 */
export function issueNow(bookId, user, input) {
  const list = Array.isArray(input.recipients)
    ? input.recipients.map((r) => String(r ?? '').trim()).filter(Boolean)
    : null;
  if (list && list.length > MAX_BATCH) fail(400, `ออกเลขได้ครั้งละไม่เกิน ${MAX_BATCH} ราย`);
  if (list && !list.length) fail(400, 'กรุณาระบุผู้รับอย่างน้อย 1 ราย');
  return tx(() => {
    const b = getBook(bookId);
    const base = cleanFields(b.type, input);
    const rows = list ? list.map((r) => ({ ...base, recipient: r.slice(0, 300) })) : [base];
    rows.forEach((d) => requireFields(b.type, d));
    const { first } = allocate(b, rows.length);
    const now = bkkNow();
    const out = rows.map((data, i) => {
      const no = first + i;
      if (b.type === 'send') data.doc_ref = sendRef(b, no);
      const cols = Object.keys(data);
      const r = db.prepare(`INSERT INTO entries(book_id, no, entry_date, entry_time, status, mode, reserved_by, reserved_name, created_by, created_at, filled_at, updated_at${cols.map((c) => ', ' + c).join('')})
        VALUES (?,?,?,?, 'filled', 'issue', ?, ?, ?, ?, ?, ?${cols.map(() => ', ?').join('')})`)
        .run(b.id, no, now.date, now.time, user.id, user.full_name, user.id, Date.now(), Date.now(), Date.now(), ...cols.map((c) => data[c]));
      log(r.lastInsertRowid, user, 'issue', { no });
      return getEntry(r.lastInsertRowid);
    });
    return list ? out : out[0];
  });
}

/** คำแนะนำจากข้อมูลที่เคยกรอกในเล่มนี้ (ช่วยกรอกค่าที่ซ้ำบ่อย เช่น จาก "อบต." / การปฏิบัติ "กองช่าง") */
export function suggestions(bookId) {
  const b = getBook(bookId);
  const out = {};
  for (const f of BOOK_TYPES[b.type].fields) {
    if (!f.suggest) continue;
    out[f.key] = db.prepare(`SELECT ${f.key} v, COUNT(*) c, MAX(id) m FROM entries WHERE book_id = ? AND status = 'filled' AND COALESCE(${f.key}, '') <> ''
      GROUP BY ${f.key} ORDER BY m DESC LIMIT 40`).all(b.id).map((r) => r.v);
  }
  const last = db.prepare("SELECT * FROM entries WHERE book_id = ? AND status = 'filled' ORDER BY no DESC LIMIT 1").get(b.id) || null;
  const prev = {};
  if (last) for (const k of fieldsOf(b.type)) if (k !== 'doc_ref' || b.type !== 'send') prev[k] = last[k] ?? '';
  return { values: out, last: last ? prev : null, lastNo: last?.no ?? null };
}

/** จองเลข: ล็อกเลขล่าสุดของวันที่จอง แล้วกรอกรายละเอียดภายหลัง (ไม่นับเป็นการแก้ไข) */
export function reserve(bookId, user, { count = 1, reservedName, subject } = {}) {
  count = Math.floor(Number(count) || 1);
  if (count < 1 || count > MAX_RESERVE) fail(400, `จองได้ครั้งละ 1–${MAX_RESERVE} เลข`);
  const name = String(reservedName || user.full_name).trim().slice(0, 120);
  if (!name) fail(400, 'กรุณาลงชื่อผู้จอง');
  return tx(() => {
    const b = getBook(bookId);
    const { first, last } = allocate(b, count);
    const now = bkkNow();
    const ids = [];
    for (let no = first; no <= last; no++) {
      const r = db.prepare(`INSERT INTO entries(book_id, no, entry_date, entry_time, status, mode, reserved_by, reserved_name, subject, doc_ref, created_by, created_at, updated_at)
        VALUES (?,?,?,?, 'reserved', 'reserve', ?, ?, ?, ?, ?, ?, ?)`)
        .run(b.id, no, now.date, now.time, user.id, name, String(subject || '').trim().slice(0, 300) || null,
          b.type === 'send' ? sendRef(b, no) : null, user.id, Date.now(), Date.now());
      log(r.lastInsertRowid, user, 'reserve', { no, name });
      ids.push(r.lastInsertRowid);
    }
    return ids.map(getEntry);
  });
}

export function canModify(entry, user, isAdmin) {
  if (isAdmin) return true;
  if (!user) return false;
  return entry.reserved_by === user.id || entry.created_by === user.id;
}

/** กรอกรายละเอียด (เลขที่จองไว้) หรือแก้ไข (เลขที่ลงรายละเอียดแล้ว) */
export function updateEntry(id, user, isAdmin, input) {
  return tx(() => {
    const e = getEntry(id);
    if (e.status === 'cancelled') fail(400, 'เลขนี้ถูกยกเลิกแล้ว');
    if (!canModify(e, user, isAdmin)) fail(403, 'แก้ไขได้เฉพาะผู้ออกเลข/ผู้จอง หรือผู้ดูแลระบบ');
    const b = getBook(e.book_id);
    const data = cleanFields(b.type, input);
    if (b.type === 'send') delete data.doc_ref;
    const merged = { ...e, ...data };
    requireFields(b.type, merged);
    const cols = Object.keys(data);
    if (e.status === 'reserved') {
      // กรอกรายละเอียดครั้งแรกของเลขที่จอง — ไม่นับเป็นการแก้ไข และคงวันที่จองไว้
      db.prepare(`UPDATE entries SET status = 'filled', filled_at = ?, updated_at = ?${cols.map((c) => `, ${c} = ?`).join('')} WHERE id = ?`)
        .run(Date.now(), Date.now(), ...cols.map((c) => data[c]), id);
      log(id, user, 'fill', null);
    } else {
      const changes = {};
      for (const c of cols) if ((e[c] ?? '') !== data[c]) changes[c] = [e[c] ?? '', data[c]];
      if (!Object.keys(changes).length) return e;
      db.prepare(`UPDATE entries SET updated_at = ?, edit_count = edit_count + 1${cols.map((c) => `, ${c} = ?`).join('')} WHERE id = ?`)
        .run(Date.now(), ...cols.map((c) => data[c]), id);
      log(id, user, 'edit', changes);
    }
    return getEntry(id);
  });
}

export function cancelEntry(id, user, isAdmin, reason) {
  const e = getEntry(id);
  if (e.status === 'cancelled') return e;
  if (!canModify(e, user, isAdmin)) fail(403, 'ยกเลิกได้เฉพาะผู้ออกเลข/ผู้จอง หรือผู้ดูแลระบบ');
  if (e.status === 'filled' && !isAdmin) fail(403, 'เลขที่ลงรายละเอียดแล้ว ยกเลิกได้โดยผู้ดูแลระบบเท่านั้น');
  const r = String(reason || '').trim().slice(0, 300);
  if (!r) fail(400, 'กรุณาระบุเหตุผลการยกเลิก');
  // ตามหลักงานสารบรรณ เลขที่ออกไปแล้วจะไม่นำกลับมาใช้ใหม่ — บันทึกเป็น "ยกเลิก"
  db.prepare("UPDATE entries SET status = 'cancelled', cancel_reason = ?, updated_at = ? WHERE id = ?").run(r, Date.now(), id);
  log(id, user, 'cancel', { reason: r });
  return getEntry(id);
}

export function getEntry(id) {
  const e = db.prepare('SELECT * FROM entries WHERE id = ?').get(id);
  if (!e) fail(404, 'ไม่พบรายการ');
  return e;
}

export function entryDetail(id) {
  const e = getEntry(id);
  e.logs = db.prepare('SELECT id, actor, action, detail, at FROM entry_logs WHERE entry_id = ? ORDER BY at, id').all(id)
    .map((l) => ({ ...l, detail: l.detail ? JSON.parse(l.detail) : null }));
  e.signatures = db.prepare('SELECT id, name, position, image, signed_at FROM signatures WHERE entry_id = ? ORDER BY signed_at').all(id);
  return e;
}

export function addSignature(id, user, { name, position, image }) {
  const e = getEntry(id);
  const b = getBook(e.book_id);
  if (!BOOK_TYPES[b.type].canSign) fail(400, 'สมุดประเภทนี้ไม่มีการเซ็นรับ');
  if (e.status !== 'filled') fail(400, 'ต้องลงรายละเอียดหนังสือก่อนจึงจะเซ็นรับได้');
  const n = String(name || '').trim().slice(0, 120);
  if (!n) fail(400, 'กรุณาระบุชื่อผู้รับหนังสือ');
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(String(image || '')) || image.length < 200) fail(400, 'กรุณาเซ็นชื่อในช่องลายมือชื่อ');
  if (image.length > 1_500_000) fail(400, 'ไฟล์ลายเซ็นใหญ่เกินไป');
  const r = db.prepare('INSERT INTO signatures(entry_id, user_id, name, position, image, signed_at) VALUES (?,?,?,?,?,?)')
    .run(id, user.id, n, String(position || '').trim().slice(0, 120), image, Date.now());
  log(id, user, 'sign', { name: n });
  return r.lastInsertRowid;
}
