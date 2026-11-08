import crypto from 'node:crypto';
import { db, getSetting, setSetting } from './db.js';
import { fail, parseCookies } from './http.js';

const SESSION_DAYS = 30;
const ADMIN_MINUTES = 30;

export function hashSecret(secret) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(secret), salt, 32).toString('hex');
  return `${salt}:${hash}`;
}
export function verifySecret(secret, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(String(secret), salt, 32);
  return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
}

export function createSession(userId, adminUntil = 0) {
  const token = crypto.randomBytes(24).toString('base64url');
  db.prepare('INSERT INTO sessions(token, user_id, admin_until, expires_at) VALUES (?,?,?,?)')
    .run(token, userId, adminUntil, Date.now() + SESSION_DAYS * 864e5);
  return token;
}

export function sessionCookie(token, maxAgeDays = SESSION_DAYS) {
  return `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeDays * 86400}`;
}

/** โหลดสถานะผู้ใช้จากคุกกี้ */
export function loadAuth(req) {
  const token = parseCookies(req).sid;
  if (!token) return { token: null, user: null, isAdmin: false };
  const s = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!s || s.expires_at < Date.now()) {
    if (s) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return { token: null, user: null, isAdmin: false };
  }
  const user = s.user_id ? db.prepare('SELECT * FROM users WHERE id = ?').get(s.user_id) : null;
  const isAdmin = s.admin_until > Date.now();
  if (isAdmin) db.prepare('UPDATE sessions SET admin_until = ? WHERE token = ?').run(Date.now() + ADMIN_MINUTES * 60e3, token);
  return { token, user, isAdmin, session: s };
}

export function publicUser(u) {
  if (!u) return null;
  let prefs = {};
  try { prefs = JSON.parse(u.prefs || '{}'); } catch {}
  return { id: u.id, username: u.username, fullName: u.full_name, position: u.position, department: u.department, phone: u.phone, status: u.status, prefs };
}

export function requireUser(ctx) {
  if (!ctx.auth.user) fail(401, 'กรุณาเข้าสู่ระบบ');
  if (ctx.auth.user.status !== 'active') fail(403, 'บัญชียังไม่ได้รับการอนุมัติจากผู้ดูแลระบบ');
  return ctx.auth.user;
}
export function requireAdmin(ctx) {
  if (!ctx.auth.isAdmin) fail(403, 'ต้องปลดล็อกผู้ดูแลระบบด้วย PIN');
}

// ---------- PIN ผู้ดูแลระบบ (ไม่มีบัญชีแอดมินเริ่มต้น — กำหนด PIN ครั้งแรกตอนติดตั้ง) ----------
const pinFails = { count: 0, until: 0 };

export const isSetupDone = () => !!getSetting('adminPin');

export function validPin(pin) {
  return /^\d{6,8}$/.test(String(pin || ''));
}

export function setAdminPin(pin) {
  if (!validPin(pin)) fail(400, 'PIN ต้องเป็นตัวเลข 6–8 หลัก');
  setSetting('adminPin', hashSecret(pin));
}

export function checkPin(pin) {
  if (pinFails.until > Date.now()) {
    fail(429, `ใส่ PIN ผิดหลายครั้ง กรุณารอ ${Math.ceil((pinFails.until - Date.now()) / 60000)} นาที`);
  }
  if (!verifySecret(pin, getSetting('adminPin'))) {
    pinFails.count++;
    if (pinFails.count >= 5) { pinFails.until = Date.now() + 5 * 60e3; pinFails.count = 0; }
    fail(401, 'PIN ไม่ถูกต้อง');
  }
  pinFails.count = 0;
}

export function elevate(ctx) {
  const until = Date.now() + ADMIN_MINUTES * 60e3;
  if (ctx.auth.token) {
    db.prepare('UPDATE sessions SET admin_until = ? WHERE token = ?').run(until, ctx.auth.token);
    return null;
  }
  // ยังไม่ได้เข้าสู่ระบบสมาชิก — สร้าง session สำหรับผู้ดูแลอย่างเดียว (ใช้อนุมัติสมาชิกคนแรก)
  return createSession(null, until);
}

export function cleanupSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
}
