// ธีมเทศกาล ไทยและสากล — เปิดอัตโนมัติก่อนถึงวันเทศกาล 7 วัน และกลับเป็นธีมเดิมเมื่อจบวันเทศกาล
import { isoAddDays, isoDiffDays } from './thaidate.js';

export const LEAD_DAYS = 7;

const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

/** วันเสาร์ที่ 2 ของเดือนมกราคม (วันเด็กแห่งชาติ) */
function secondSaturdayJan(y) {
  const first = new Date(Date.UTC(y, 0, 1)).getUTCDay();
  const firstSat = 1 + ((6 - first + 7) % 7);
  return ymd(y, 1, firstSat + 7);
}

// วันตามปฏิทินจันทรคติ (ตารางล่วงหน้า) — ถ้าเลยปีในตาราง เทศกาลนั้นจะไม่แสดงจนกว่าจะเพิ่มข้อมูล
const CHINESE_NEW_YEAR = {
  2024: '2024-02-10', 2025: '2025-01-29', 2026: '2026-02-17', 2027: '2027-02-06', 2028: '2028-01-26',
  2029: '2029-02-13', 2030: '2030-02-03', 2031: '2031-01-23', 2032: '2032-02-11', 2033: '2033-01-31',
  2034: '2034-02-19', 2035: '2035-02-08',
};
const LOY_KRATHONG = {
  2024: '2024-11-15', 2025: '2025-11-05', 2026: '2026-11-24', 2027: '2027-11-13', 2028: '2028-11-02',
  2029: '2029-11-21', 2030: '2030-11-10',
};

/**
 * range(y) คืน [วันเริ่ม, วันสิ้นสุด] ของเทศกาลในปี ค.ศ. y (หรือ null)
 * theme = คีย์ธีมใน themes.js
 */
export const FESTIVALS = [
  { id: 'newyear', name: 'วันขึ้นปีใหม่', scope: 'สากล', emoji: '🎆', range: (y) => [ymd(y, 1, 1), ymd(y, 1, 1)] },
  { id: 'children', name: 'วันเด็กแห่งชาติ', scope: 'ไทย', emoji: '🎈', range: (y) => [secondSaturdayJan(y), secondSaturdayJan(y)] },
  { id: 'valentine', name: 'วันวาเลนไทน์', scope: 'สากล', emoji: '💗', range: (y) => [ymd(y, 2, 14), ymd(y, 2, 14)] },
  { id: 'chinese', name: 'วันตรุษจีน', scope: 'ไทย-จีน', emoji: '🏮', range: (y) => (CHINESE_NEW_YEAR[y] ? [CHINESE_NEW_YEAR[y], CHINESE_NEW_YEAR[y]] : null) },
  { id: 'songkran', name: 'เทศกาลสงกรานต์', scope: 'ไทย', emoji: '💦', range: (y) => [ymd(y, 4, 13), ymd(y, 4, 15)] },
  { id: 'mother', name: 'วันแม่แห่งชาติ', scope: 'ไทย', emoji: '🌼', range: (y) => [ymd(y, 8, 12), ymd(y, 8, 12)] },
  { id: 'halloween', name: 'วันฮาโลวีน', scope: 'สากล', emoji: '🎃', range: (y) => [ymd(y, 10, 31), ymd(y, 10, 31)] },
  { id: 'loykrathong', name: 'วันลอยกระทง', scope: 'ไทย', emoji: '🪷', range: (y) => (LOY_KRATHONG[y] ? [LOY_KRATHONG[y], LOY_KRATHONG[y]] : null) },
  { id: 'father', name: 'วันพ่อแห่งชาติ', scope: 'ไทย', emoji: '💛', range: (y) => [ymd(y, 12, 5), ymd(y, 12, 5)] },
  { id: 'christmas', name: 'วันคริสต์มาส', scope: 'สากล', emoji: '🎄', range: (y) => [ymd(y, 12, 25), ymd(y, 12, 25)] },
];

/** ทุกช่วงเทศกาลที่ครอบคลุมวันที่ iso (รวมช่วงนับถอยหลัง 7 วัน) */
export function festivalWindows(iso) {
  const y = +iso.slice(0, 4);
  const out = [];
  for (const f of FESTIVALS) {
    for (const yy of [y - 1, y, y + 1]) {
      const r = f.range(yy);
      if (!r) continue;
      const [start, end] = r;
      const showFrom = isoAddDays(start, -LEAD_DAYS);
      if (iso >= showFrom && iso <= end) {
        out.push({ ...f, start, end, showFrom, ongoing: iso >= start, daysLeft: Math.max(0, isoDiffDays(start, iso)) });
      }
    }
  }
  return out;
}

/**
 * เทศกาลที่ใช้งานในวันนั้น
 * ถ้าช่วงทับกัน: เทศกาลที่ถึงวันแล้วมาก่อน จากนั้นเทศกาลที่ใกล้ที่สุด
 */
export function activeFestival(iso) {
  const list = festivalWindows(iso);
  list.sort((a, b) => (b.ongoing - a.ongoing) || a.start.localeCompare(b.start));
  return list[0] || null;
}

export function upcomingFestivals(iso, count = 4) {
  const y = +iso.slice(0, 4);
  const all = [];
  for (const f of FESTIVALS) for (const yy of [y, y + 1]) {
    const r = f.range(yy);
    if (r && r[1] >= iso) all.push({ ...f, start: r[0], end: r[1], showFrom: isoAddDays(r[0], -LEAD_DAYS) });
  }
  return all.sort((a, b) => a.start.localeCompare(b.start)).slice(0, count);
}
