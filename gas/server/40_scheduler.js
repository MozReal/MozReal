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
