import fs from 'node:fs';
import path from 'node:path';
import { db, getSetting, setSetting, SETTING_DEFAULTS, DATA_DIR, ROOT, backupTo } from './db.js';
import { createRouter, fail } from './http.js';
import {
  hashSecret, verifySecret, createSession, sessionCookie, publicUser, requireUser, requireAdmin,
  isSetupDone, setAdminPin, checkPin, elevate, validPin,
} from './auth.js';
import {
  getBook, bookSummary, issueNow, suggestions, reserve, updateEntry, cancelEntry, entryDetail, addSignature, canModify, nextNo,
} from './ledger.js';
import { tgCall, sendDaily, sendMessage, detectChats, notifyNewMember, buildDailyMessage } from './telegram.js';
import * as updater from './updater.js';
import { BOOK_TYPES } from '../public/js/shared/schema.js';
import { bkkNow, toBE } from '../public/js/shared/thaidate.js';
import { activeFestival } from '../public/js/shared/festivals.js';

export const api = createRouter();

const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);

// ---------------- ทั่วไป ----------------
api.get('/api/bootstrap', (ctx) => {
  const today = bkkNow().date;
  const force = getSetting('festivalForce');
  return {
    setupDone: isSetupDone(),
    orgName: getSetting('orgName'),
    user: publicUser(ctx.auth.user),
    isAdmin: ctx.auth.isAdmin,
    today,
    festival: {
      auto: getSetting('festivalAuto') === '1',
      force: force || null,
      active: activeFestival(today),
    },
    version: JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version,
  };
});

api.post('/api/setup', (ctx) => {
  if (isSetupDone()) fail(400, 'ระบบถูกตั้งค่าแล้ว');
  const { orgName, pin, pin2 } = ctx.body;
  if (!str(orgName)) fail(400, 'กรุณาระบุชื่อหน่วยงาน');
  if (pin !== pin2) fail(400, 'PIN ยืนยันไม่ตรงกัน');
  setAdminPin(pin);
  setSetting('orgName', str(orgName));
  // สร้างสมุดเริ่มต้นของปีปัจจุบัน (แยกเล่ม แยกเลข)
  const year = toBE(bkkNow().year);
  if (!db.prepare('SELECT COUNT(*) c FROM books').get().c) {
    const ins = db.prepare('INSERT INTO books(type, name, year, prefix, color, sort, created_at) VALUES (?,?,?,?,?,?,?)');
    ins.run('receive', `ทะเบียนหนังสือรับ ปี ${year}`, year, '', '#2f6fde', 1, Date.now());
    ins.run('send', `ทะเบียนหนังสือส่ง ปี ${year}`, year, '', '#d9772b', 2, Date.now());
    ins.run('petition', `สมุดคุมเลขรับคำร้องทั่วไป ปี ${year}`, year, '', '#1f9e74', 3, Date.now());
  }
  const token = elevate(ctx);
  return { ok: true, headers: token ? { 'set-cookie': sessionCookie(token, 1) } : {} };
});

api.post('/api/register', (ctx) => {
  if (!isSetupDone()) fail(400, 'ระบบยังไม่ได้ตั้งค่าเริ่มต้น');
  const b = ctx.body;
  const username = str(b.username, 40).toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) fail(400, 'ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - อย่างน้อย 3 ตัว');
  if (String(b.password || '').length < 6) fail(400, 'รหัสผ่านอย่างน้อย 6 ตัวอักษร');
  if (!str(b.fullName)) fail(400, 'กรุณากรอกชื่อ-นามสกุล');
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) fail(409, 'ชื่อผู้ใช้นี้ถูกใช้แล้ว');
  const r = db.prepare('INSERT INTO users(username, pass, full_name, position, department, phone, status, created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(username, hashSecret(b.password), str(b.fullName, 120), str(b.position, 120), str(b.department, 120), str(b.phone, 40), 'pending', Date.now());
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid);
  notifyNewMember(user);
  return { ok: true, status: 'pending' };
});

api.post('/api/login', (ctx) => {
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(str(ctx.body.username, 40).toLowerCase());
  if (!u || !verifySecret(ctx.body.password || '', u.pass)) fail(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  if (u.status === 'pending') fail(403, 'บัญชีของคุณกำลังรอผู้ดูแลระบบอนุมัติ');
  if (u.status === 'rejected') fail(403, 'คำขอสมัครสมาชิกไม่ได้รับการอนุมัติ');
  if (u.status === 'disabled') fail(403, 'บัญชีถูกระงับการใช้งาน');
  // ถ้าปลดล็อกผู้ดูแลไว้ก่อนหน้าใน session นี้ ให้คงสิทธิ์ไว้
  const adminUntil = ctx.auth.isAdmin ? ctx.auth.session.admin_until : 0;
  if (ctx.auth.token) db.prepare('DELETE FROM sessions WHERE token = ?').run(ctx.auth.token);
  const token = createSession(u.id, adminUntil);
  db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(Date.now(), u.id);
  return { ok: true, user: publicUser(u), headers: { 'set-cookie': sessionCookie(token) } };
});

api.post('/api/logout', (ctx) => {
  if (ctx.auth.token) db.prepare('DELETE FROM sessions WHERE token = ?').run(ctx.auth.token);
  return { ok: true, headers: { 'set-cookie': 'sid=; Path=/; Max-Age=0' } };
});

api.put('/api/me/prefs', (ctx) => {
  const u = requireUser(ctx);
  const allowed = ['theme', 'sound', 'soundVolume', 'festival', 'particles', 'density'];
  let prefs = {};
  try { prefs = JSON.parse(u.prefs || '{}'); } catch {}
  for (const k of allowed) if (ctx.body[k] !== undefined) prefs[k] = ctx.body[k];
  db.prepare('UPDATE users SET prefs = ? WHERE id = ?').run(JSON.stringify(prefs).slice(0, 2000), u.id);
  return { ok: true, prefs };
});

api.put('/api/me/profile', (ctx) => {
  const u = requireUser(ctx);
  const b = ctx.body;
  if (!str(b.fullName)) fail(400, 'กรุณากรอกชื่อ-นามสกุล');
  db.prepare('UPDATE users SET full_name = ?, position = ?, department = ?, phone = ? WHERE id = ?')
    .run(str(b.fullName, 120), str(b.position, 120), str(b.department, 120), str(b.phone, 40), u.id);
  return { ok: true };
});

api.put('/api/me/password', (ctx) => {
  const u = requireUser(ctx);
  if (!verifySecret(ctx.body.current || '', u.pass)) fail(400, 'รหัสผ่านเดิมไม่ถูกต้อง');
  if (String(ctx.body.next || '').length < 6) fail(400, 'รหัสผ่านใหม่อย่างน้อย 6 ตัวอักษร');
  db.prepare('UPDATE users SET pass = ? WHERE id = ?').run(hashSecret(ctx.body.next), u.id);
  return { ok: true };
});

// ---------------- สมุด / เลข ----------------
const canView = (ctx) => { if (!ctx.auth.isAdmin) requireUser(ctx); };

api.get('/api/books', (ctx) => {
  canView(ctx);
  return db.prepare('SELECT * FROM books ORDER BY status = \'closed\', sort, year DESC, id').all().map(bookSummary);
});

api.get('/api/books/:id', (ctx) => { canView(ctx); return bookSummary(getBook(ctx.params.id)); });

api.get('/api/books/:id/entries', (ctx) => {
  canView(ctx);
  const b = getBook(ctx.params.id);
  const q = ctx.query;
  const where = ['book_id = ?'];
  const args = [b.id];
  if (['reserved', 'filled', 'cancelled'].includes(q.get('status'))) { where.push('status = ?'); args.push(q.get('status')); }
  if (q.get('unsigned') === '1') where.push("status = 'filled' AND NOT EXISTS (SELECT 1 FROM signatures s WHERE s.entry_id = entries.id)");
  if (/^\d{4}-\d{2}$/.test(q.get('month') || '')) { where.push('substr(entry_date,1,7) = ?'); args.push(q.get('month')); }
  if (q.get('mine') === '1' && ctx.auth.user) { where.push('(reserved_by = ? OR created_by = ?)'); args.push(ctx.auth.user.id, ctx.auth.user.id); }
  const text = str(q.get('q'), 100);
  if (text) {
    where.push(`(CAST(no AS TEXT) = ? OR ${['doc_ref', 'sender', 'recipient', 'subject', 'action', 'note', 'petitioner', 'contact', 'reserved_name'].map((c) => `${c} LIKE ?`).join(' OR ')})`);
    args.push(text, ...Array(9).fill(`%${text}%`));
  }
  const limit = Math.min(500, Math.max(10, +q.get('limit') || 100));
  const page = Math.max(0, +q.get('page') || 0);
  const order = q.get('order') === 'asc' ? 'ASC' : 'DESC';
  const sql = `FROM entries WHERE ${where.join(' AND ')}`;
  const total = db.prepare(`SELECT COUNT(*) c ${sql}`).get(...args).c;
  const rows = db.prepare(`SELECT *, (SELECT COUNT(*) FROM signatures s WHERE s.entry_id = entries.id) AS sign_count ${sql} ORDER BY no ${order} LIMIT ? OFFSET ?`)
    .all(...args, limit, page * limit);
  const uid = ctx.auth.user?.id ?? null;
  for (const r of rows) r.canEdit = canModify(r, ctx.auth.user, ctx.auth.isAdmin) && r.status !== 'cancelled';
  return { book: bookSummary(b), total, page, limit, rows, uid };
});

api.get('/api/books/:id/suggest', (ctx) => { canView(ctx); return suggestions(ctx.params.id); });
api.post('/api/books/:id/issue', (ctx) => issueNow(ctx.params.id, requireUser(ctx), ctx.body));
api.post('/api/books/:id/reserve', (ctx) => reserve(ctx.params.id, requireUser(ctx), ctx.body));

api.get('/api/entries/:id', (ctx) => {
  canView(ctx);
  const e = entryDetail(ctx.params.id);
  e.canEdit = canModify(e, ctx.auth.user, ctx.auth.isAdmin) && e.status !== 'cancelled';
  e.book = bookSummary(getBook(e.book_id));
  return e;
});
api.put('/api/entries/:id', (ctx) => {
  if (!ctx.auth.isAdmin) requireUser(ctx);
  return updateEntry(ctx.params.id, ctx.auth.user, ctx.auth.isAdmin, ctx.body);
});
api.post('/api/entries/:id/cancel', (ctx) => {
  if (!ctx.auth.isAdmin) requireUser(ctx);
  return cancelEntry(ctx.params.id, ctx.auth.user, ctx.auth.isAdmin, ctx.body.reason);
});
api.post('/api/entries/:id/sign', (ctx) => ({ id: addSignature(ctx.params.id, requireUser(ctx), ctx.body) }));
api.delete('/api/signatures/:id', (ctx) => {
  requireAdmin(ctx);
  const s = db.prepare('SELECT * FROM signatures WHERE id = ?').get(ctx.params.id);
  if (!s) fail(404, 'ไม่พบลายเซ็น');
  db.prepare('DELETE FROM signatures WHERE id = ?').run(s.id);
  db.prepare('INSERT INTO entry_logs(entry_id, actor, action, detail, at) VALUES (?,?,?,?,?)')
    .run(s.entry_id, 'ผู้ดูแลระบบ', 'unsign', JSON.stringify({ name: s.name }), Date.now());
  return { ok: true };
});

/** จุดแดง: เลขที่จองค้างไว้ยังไม่ลงรายละเอียด (แสดงในระบบเท่านั้น ไม่ส่งแจ้งเตือนบอท) */
api.get('/api/badges', (ctx) => {
  canView(ctx);
  const uid = ctx.auth.user?.id ?? -1;
  const perBook = Object.fromEntries(db.prepare("SELECT book_id, COUNT(*) c FROM entries WHERE status = 'reserved' GROUP BY book_id").all().map((r) => [r.book_id, r.c]));
  const mine = db.prepare("SELECT COUNT(*) c FROM entries WHERE status = 'reserved' AND reserved_by = ?").get(uid).c;
  const total = Object.values(perBook).reduce((a, b) => a + b, 0);
  const pendingMembers = ctx.auth.isAdmin ? db.prepare("SELECT COUNT(*) c FROM users WHERE status = 'pending'").get().c : 0;
  let updates = 0;
  if (ctx.auth.isAdmin) try { updates = JSON.parse(getSetting('updatePending') || '[]').length; } catch {}
  return { perBook, mine, total, pendingMembers, updates };
});

api.get('/api/reservations/mine', (ctx) => {
  const u = requireUser(ctx);
  return db.prepare(`SELECT e.*, b.name AS book_name, b.type AS book_type, b.year AS book_year FROM entries e JOIN books b ON b.id = e.book_id
    WHERE e.status = 'reserved' AND e.reserved_by = ? ORDER BY e.entry_date, e.no`).all(u.id);
});

api.get('/api/books/:id/export.csv', (ctx) => {
  canView(ctx);
  const b = getBook(ctx.params.id);
  const t = BOOK_TYPES[b.type];
  const rows = db.prepare('SELECT * FROM entries WHERE book_id = ? ORDER BY no').all(b.id);
  const cols = [['no', t.noLabel], ['entry_date', t.dateLabel], ['entry_time', 'เวลา'], ...t.fields.map((f) => [f.key, f.label]), ['status', 'สถานะ'], ['reserved_name', 'ผู้ออกเลข/ผู้จอง'], ['edit_count', 'จำนวนครั้งที่แก้ไข'], ['cancel_reason', 'เหตุผลยกเลิก']];
  if (b.type === 'send') cols.splice(1, 0, ['doc_ref', 'ที่']);
  const label = { reserved: 'จองไว้', filled: 'บันทึกแล้ว', cancelled: 'ยกเลิก' };
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [cols.map((c) => esc(c[1])).join(',')];
  for (const r of rows) lines.push(cols.map(([k]) => esc(k === 'status' ? label[r[k]] : r[k])).join(','));
  return { raw: '﻿' + lines.join('\r\n'), type: 'text/csv; charset=utf-8', filename: `${b.name}.csv` };
});

// ---------------- ผู้ดูแลระบบ (PIN) ----------------
api.post('/api/admin/unlock', (ctx) => {
  if (!isSetupDone()) fail(400, 'ระบบยังไม่ได้ตั้งค่า');
  checkPin(ctx.body.pin);
  const token = elevate(ctx);
  return { ok: true, headers: token ? { 'set-cookie': sessionCookie(token, 1) } : {} };
});
api.post('/api/admin/lock', (ctx) => {
  if (ctx.auth.token) {
    if (ctx.auth.user) db.prepare('UPDATE sessions SET admin_until = 0 WHERE token = ?').run(ctx.auth.token);
    else db.prepare('DELETE FROM sessions WHERE token = ?').run(ctx.auth.token);
  }
  return { ok: true };
});
api.put('/api/admin/pin', (ctx) => {
  requireAdmin(ctx);
  checkPin(ctx.body.current);
  if (!validPin(ctx.body.next)) fail(400, 'PIN ใหม่ต้องเป็นตัวเลข 6–8 หลัก');
  if (ctx.body.next !== ctx.body.next2) fail(400, 'PIN ยืนยันไม่ตรงกัน');
  setAdminPin(ctx.body.next);
  return { ok: true };
});

api.get('/api/admin/users', (ctx) => {
  requireAdmin(ctx);
  return db.prepare(`SELECT id, username, full_name, position, department, phone, status, created_at, approved_at, last_login FROM users
    ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, created_at DESC`).all();
});
api.post('/api/admin/users/:id/:action', (ctx) => {
  requireAdmin(ctx);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(ctx.params.id);
  if (!u) fail(404, 'ไม่พบสมาชิก');
  const a = ctx.params.action;
  if (a === 'approve' || a === 'enable') db.prepare("UPDATE users SET status = 'active', approved_at = COALESCE(approved_at, ?) WHERE id = ?").run(Date.now(), u.id);
  else if (a === 'reject') db.prepare("UPDATE users SET status = 'rejected' WHERE id = ?").run(u.id);
  else if (a === 'disable') {
    db.prepare("UPDATE users SET status = 'disabled' WHERE id = ?").run(u.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  } else if (a === 'reset-password') {
    const pw = String(ctx.body.password || '');
    if (pw.length < 6) fail(400, 'รหัสผ่านอย่างน้อย 6 ตัวอักษร');
    db.prepare('UPDATE users SET pass = ? WHERE id = ?').run(hashSecret(pw), u.id);
  } else if (a === 'delete') {
    const used = db.prepare('SELECT COUNT(*) c FROM entries WHERE reserved_by = ? OR created_by = ?').get(u.id, u.id).c;
    if (used) fail(400, 'สมาชิกนี้มีประวัติการออกเลขแล้ว ใช้ "ระงับ" แทนการลบ');
    db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
  } else fail(400, 'คำสั่งไม่ถูกต้อง');
  return { ok: true };
});

function bookInput(b, existing) {
  const out = {};
  if (!existing || b.type !== undefined) {
    if (!BOOK_TYPES[b.type]) fail(400, 'ประเภทสมุดไม่ถูกต้อง');
    out.type = b.type;
  }
  out.name = str(b.name ?? existing?.name, 150);
  if (!out.name) fail(400, 'กรุณาตั้งชื่อสมุด');
  out.year = Math.floor(+(b.year ?? existing?.year));
  if (!(out.year > 2400 && out.year < 2700)) fail(400, 'ปี พ.ศ. ไม่ถูกต้อง');
  out.prefix = str(b.prefix ?? existing?.prefix ?? '', 60);
  out.start_no = Math.max(1, Math.floor(+(b.start_no ?? existing?.start_no ?? 1)));
  out.color = /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : (existing?.color || '#2f6fde');
  out.sort = Math.floor(+(b.sort ?? existing?.sort ?? 0)) || 0;
  return out;
}

api.post('/api/admin/books', (ctx) => {
  requireAdmin(ctx);
  const d = bookInput(ctx.body);
  const r = db.prepare('INSERT INTO books(type, name, year, prefix, start_no, color, sort, created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(d.type, d.name, d.year, d.prefix, d.start_no, d.color, d.sort, Date.now());
  return bookSummary(getBook(r.lastInsertRowid));
});
api.put('/api/admin/books/:id', (ctx) => {
  requireAdmin(ctx);
  const b = getBook(ctx.params.id);
  const d = bookInput({ ...ctx.body, type: undefined }, b);
  const used = db.prepare('SELECT COUNT(*) c FROM entries WHERE book_id = ?').get(b.id).c;
  if (used && d.start_no !== b.start_no) fail(400, 'สมุดที่มีการออกเลขแล้ว เปลี่ยนเลขเริ่มต้นไม่ได้');
  // เปลี่ยนรหัส "ที่" (prefix) ได้ — เลขที่ออกไปแล้วยังคงค่าเดิม มีผลกับเลขถัดไปเท่านั้น
  db.prepare('UPDATE books SET name = ?, year = ?, prefix = ?, start_no = ?, color = ?, sort = ? WHERE id = ?')
    .run(d.name, d.year, d.prefix, d.start_no, d.color, d.sort, b.id);
  return bookSummary(getBook(b.id));
});
api.post('/api/admin/books/:id/close', (ctx) => {
  requireAdmin(ctx);
  const b = getBook(ctx.params.id);
  db.prepare('UPDATE books SET status = ? WHERE id = ?').run(b.status === 'open' ? 'closed' : 'open', b.id);
  return bookSummary(getBook(b.id));
});
/** ขึ้นปีใหม่: ปิดเล่มเดิม เปิดเล่มใหม่ ประเภทเดียวกัน เริ่มเลข 1 */
api.post('/api/admin/books/:id/rollover', (ctx) => {
  requireAdmin(ctx);
  const b = getBook(ctx.params.id);
  const year = Math.max(b.year + 1, toBE(bkkNow().year));
  const name = b.name.includes(String(b.year)) ? b.name.replace(String(b.year), String(year)) : `${b.name} ปี ${year}`;
  const r = db.prepare('INSERT INTO books(type, name, year, prefix, start_no, color, sort, created_at) VALUES (?,?,?,?,1,?,?,?)')
    .run(b.type, name, year, b.prefix, b.color, b.sort, Date.now());
  db.prepare("UPDATE books SET status = 'closed' WHERE id = ?").run(b.id);
  return bookSummary(getBook(r.lastInsertRowid));
});
api.delete('/api/admin/books/:id', (ctx) => {
  requireAdmin(ctx);
  const b = getBook(ctx.params.id);
  if (db.prepare('SELECT COUNT(*) c FROM entries WHERE book_id = ?').get(b.id).c) fail(400, 'สมุดที่มีการออกเลขแล้วลบไม่ได้ ใช้ "ปิดเล่ม" แทน');
  db.prepare('DELETE FROM books WHERE id = ?').run(b.id);
  return { ok: true };
});

const ADMIN_SETTINGS = ['orgName', 'tgToken', 'tgChatId', 'baseUrl', 'notifyEnabled', 'notifyTime', 'notifyNewMember', 'notifyUpdate', 'holidays', 'festivalAuto', 'festivalForce', 'updateBranch'];
api.get('/api/admin/settings', (ctx) => {
  requireAdmin(ctx);
  const out = Object.fromEntries(ADMIN_SETTINGS.map((k) => [k, getSetting(k)]));
  out.tgToken = out.tgToken ? out.tgToken.replace(/:(.{4}).+$/, ':$1••••••••') : '';
  out.lastDaily = getSetting('lastDaily');
  out.lastDailyResult = getSetting('lastDailyResult');
  return out;
});
api.put('/api/admin/settings', (ctx) => {
  requireAdmin(ctx);
  const b = ctx.body;
  for (const k of ADMIN_SETTINGS) {
    if (b[k] === undefined) continue;
    let v = String(b[k]).trim();
    if (k === 'tgToken' && v.includes('••')) continue; // ไม่ได้เปลี่ยน token
    if (k === 'notifyTime' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) fail(400, 'รูปแบบเวลาไม่ถูกต้อง (HH:MM)');
    if (k === 'baseUrl' && v && !/^https?:\/\/[^\s]+$/i.test(v)) fail(400, 'ที่อยู่เว็บต้องขึ้นต้นด้วย http:// หรือ https://');
    if (['notifyEnabled', 'notifyNewMember', 'notifyUpdate', 'festivalAuto'].includes(k)) v = v === '1' || v === 'true' ? '1' : '0';
    if (k === 'orgName' && !v) fail(400, 'กรุณาระบุชื่อหน่วยงาน');
    setSetting(k, v.slice(0, 4000));
  }
  return { ok: true };
});

api.post('/api/admin/telegram/detect', async (ctx) => {
  requireAdmin(ctx);
  const token = str(ctx.body.token, 200);
  return detectChats(token && !token.includes('••') ? token : undefined);
});
api.post('/api/admin/telegram/test', async (ctx) => {
  requireAdmin(ctx);
  const me = await tgCall('getMe');
  await sendMessage(`✅ ทดสอบการเชื่อมต่อจากระบบสมุดคุมเลข\nบอท: @${me.username}`);
  return { ok: true, bot: me.username };
});
api.post('/api/admin/telegram/daily', async (ctx) => {
  requireAdmin(ctx);
  await sendDaily();
  return { ok: true };
});
api.get('/api/admin/telegram/preview', (ctx) => { requireAdmin(ctx); return buildDailyMessage(); });

api.get('/api/admin/update', async (ctx) => { requireAdmin(ctx); return updater.status(); });
api.post('/api/admin/update/check', async (ctx) => { requireAdmin(ctx); await updater.check(); return updater.status(); });
api.post('/api/admin/update/apply', async (ctx) => { requireAdmin(ctx); return updater.apply(); });

api.get('/api/admin/backup', (ctx) => {
  requireAdmin(ctx);
  const file = backupTo(path.join(DATA_DIR, 'backups', 'download.sqlite'));
  return { raw: fs.readFileSync(file), type: 'application/x-sqlite3', filename: `saraban-backup-${bkkNow().date}.sqlite` };
});

api.get('/api/admin/stats', (ctx) => {
  requireAdmin(ctx);
  return {
    users: db.prepare('SELECT status, COUNT(*) c FROM users GROUP BY status').all(),
    entries: db.prepare('SELECT status, COUNT(*) c FROM entries GROUP BY status').all(),
    nextNos: db.prepare("SELECT * FROM books WHERE status='open'").all().map((b) => ({ id: b.id, next: nextNo(b) })),
  };
});

export { SETTING_DEFAULTS };
