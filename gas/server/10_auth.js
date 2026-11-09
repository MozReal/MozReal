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
