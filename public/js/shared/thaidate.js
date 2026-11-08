// วันที่/เวลาแบบไทย (ใช้ร่วมกันทั้งฝั่งเซิร์ฟเวอร์และเบราว์เซอร์) — อิงเวลาประเทศไทยเสมอ
export const TZ = 'Asia/Bangkok';
export const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
export const TH_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const TH_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

/** คืนค่า { date:'YYYY-MM-DD', time:'HH:MM', dow:0-6, year } ตามเวลาไทย */
export function bkkNow(d = new Date()) {
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  const date = `${p.year}-${p.month}-${p.day}`;
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return { date, time: `${p.hour}:${p.minute}`, seconds: p.second, dow, year: +p.year };
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
