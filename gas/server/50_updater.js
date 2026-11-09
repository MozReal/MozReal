// =====================================================================
// ระบบอัพเดต (Apps Script API)
// ผู้พัฒนาส่งโค้ดใหม่และสร้าง "เวอร์ชัน" ไว้ (เช่น clasp push && clasp version "คำอธิบาย")
// → เวอร์ชันใหม่จะขึ้นมารอในหน้าผู้ดูแล และเว็บแอปจะเปลี่ยนไปใช้เวอร์ชันใหม่ก็ต่อเมื่อผู้ดูแลกดยืนยัน
// ต้องเปิด "Google Apps Script API" ที่ https://script.google.com/home/usersettings (บัญชีเจ้าของสคริปต์)
// =====================================================================
var APP_VERSION = '__APP_VERSION__';

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
