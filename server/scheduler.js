// ตัวตั้งเวลา: แจ้งเตือนเลขล่าสุดทุกวันจันทร์–ศุกร์ ตามเวลาที่ตั้ง (ค่าเริ่มต้น 08:30 เวลาไทย)
import { getSetting, setSetting } from './db.js';
import { sendDaily, tgConfigured, notifyUpdate } from './telegram.js';
import { check as checkUpdate } from './updater.js';
import { cleanupSessions } from './auth.js';
import { bkkNow } from '../public/js/shared/thaidate.js';

const CATCH_UP_MINUTES = 150; // ถ้าเครื่องเปิดช้ากว่ากำหนด ยังส่งย้อนได้ภายใน 2.5 ชม.
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
let attempts = { date: '', n: 0 };
let lastUpdateCheckDay = '';

export function holidaysSet() {
  return new Set((getSetting('holidays') || '').split(/[\s,]+/).map((s) => s.trim()).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)));
}

export function shouldSendDaily(now = bkkNow()) {
  if (getSetting('notifyEnabled') !== '1' || !tgConfigured()) return false;
  if (now.dow < 1 || now.dow > 5) return false; // จันทร์–ศุกร์เท่านั้น
  if (holidaysSet().has(now.date)) return false;
  const at = getSetting('notifyTime') || '08:30';
  const diff = toMin(now.time) - toMin(at);
  if (diff < 0 || diff > CATCH_UP_MINUTES) return false;
  return getSetting('lastDaily') !== now.date;
}

async function tick() {
  const now = bkkNow();
  if (shouldSendDaily(now)) {
    if (attempts.date !== now.date) attempts = { date: now.date, n: 0 };
    if (attempts.n < 5) {
      attempts.n++;
      try {
        await sendDaily();
        setSetting('lastDaily', now.date);
        setSetting('lastDailyResult', `ส่งสำเร็จ ${now.date} ${now.time}`);
      } catch (e) {
        setSetting('lastDailyResult', `ส่งไม่สำเร็จ ${now.date} ${now.time}: ${e.message}`);
        console.warn('[scheduler] daily notify failed:', e.message);
      }
    }
  }
  // ตรวจอัพเดตวันละครั้ง (ดาวน์โหลดมารอผู้ดูแลยืนยัน)
  if (now.time >= '07:00' && lastUpdateCheckDay !== now.date) {
    lastUpdateCheckDay = now.date;
    cleanupSessions();
    checkUpdate().then((r) => r.isNew && notifyUpdate(r.pending)).catch(() => {});
  }
}

export function startScheduler() {
  setInterval(() => tick().catch((e) => console.error('[scheduler]', e)), 30_000);
  setTimeout(() => tick().catch(() => {}), 3000);
}
