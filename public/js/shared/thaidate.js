// วันที่/เวลาแบบไทย (ใช้ร่วมกันทั้งฝั่งเซิร์ฟเวอร์และเบราว์เซอร์) — อิงเวลาประเทศไทยเสมอ
export const TZ = 'Asia/Bangkok';
export const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
export const TH_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const TH_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

// ประเทศไทยไม่มีเวลาออมแสง (UTC+7 ตลอดปี) จึงคำนวณตรงได้ ไม่ต้องพึ่ง Intl
// (ใช้ได้เหมือนกันทั้ง Node.js, เบราว์เซอร์ และ Google Apps Script)
const p2 = (n) => String(n).padStart(2, '0');

/** คืนค่า { date:'YYYY-MM-DD', time:'HH:MM', dow:0-6, year } ตามเวลาไทย */
export function bkkNow(d = new Date()) {
  const t = new Date(d.getTime() + 7 * 3600e3);
  const date = `${t.getUTCFullYear()}-${p2(t.getUTCMonth() + 1)}-${p2(t.getUTCDate())}`;
  return { date, time: `${p2(t.getUTCHours())}:${p2(t.getUTCMinutes())}`, seconds: p2(t.getUTCSeconds()), dow: t.getUTCDay(), year: t.getUTCFullYear() };
}

export function isoAddDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function isoDiffDays(a, b) {
  return Math.round((new Date(`${a}T00:00:00Z`) - new Date(`${b}T00:00:00Z`)) / 86400000);
}

export const toBE = (y) => +y + 543;

/** 2026-11-08 → "8 พฤศจิกายน 2569" */
export function thaiDate(iso, { short = false, day = false } = {}) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  const months = short ? TH_MONTHS_SHORT : TH_MONTHS;
  const yy = short ? String(toBE(y)).slice(2) : toBE(y);
  let s = `${d} ${months[m - 1]} ${yy}`;
  if (day) s = `วัน${TH_DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}ที่ ${s}`;
  return s;
}

export function thaiDateTime(ms, opts) {
  if (!ms) return '';
  const n = bkkNow(new Date(ms));
  return `${thaiDate(n.date, opts)} ${n.time} น.`;
}

const TH_DIGITS = '๐๑๒๓๔๕๖๗๘๙';
export const thaiDigits = (s) => String(s).replace(/[0-9]/g, (c) => TH_DIGITS[c]);
