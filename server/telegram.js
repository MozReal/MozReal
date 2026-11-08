// แจ้งเตือนผ่าน Telegram Bot
import { db, getSetting } from './db.js';
import { bookSummary } from './ledger.js';
import { BOOK_TYPES } from '../public/js/shared/schema.js';
import { bkkNow, thaiDate } from '../public/js/shared/thaidate.js';
import { activeFestival } from '../public/js/shared/festivals.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const tgConfigured = () => !!(getSetting('tgToken') && getSetting('tgChatId'));

export async function tgCall(method, payload = {}, token = getSetting('tgToken')) {
  if (!token) throw new Error('ยังไม่ได้ตั้งค่า Bot Token');
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.ok) throw new Error(json.description || `Telegram ตอบกลับ ${res.status}`);
  return json.result;
}

/** ส่งข้อความ — ถ้าปุ่มลิงก์ใช้ไม่ได้ (เช่น URL เป็น localhost) จะส่งซ้ำแบบลิงก์ในข้อความแทน */
export async function sendMessage(html, buttons = [], fallbackText = '') {
  const chat_id = getSetting('tgChatId');
  if (!chat_id) throw new Error('ยังไม่ได้ตั้งค่า Chat ID');
  const base = { chat_id, text: html, parse_mode: 'HTML', disable_web_page_preview: true };
  if (buttons.length) {
    try {
      return await tgCall('sendMessage', { ...base, reply_markup: { inline_keyboard: buttons.map((b) => [b]) } });
    } catch (e) {
      if (!/url|button/i.test(e.message)) throw e;
    }
  }
  return tgCall('sendMessage', { ...base, text: html + fallbackText });
}

const baseUrl = () => (getSetting('baseUrl') || '').replace(/\/+$/, '');

export function buildDailyMessage() {
  const now = bkkNow();
  const org = getSetting('orgName');
  const books = db.prepare("SELECT * FROM books WHERE status = 'open' ORDER BY sort, id").all().map(bookSummary);
  const fest = activeFestival(now.date);
  const lines = [
    `☀️ <b>อรุณสวัสดิ์ — สรุปเลขทะเบียนประจำวัน</b>`,
    `${esc(thaiDate(now.date, { day: true }))}${org ? `\n🏛 ${esc(org)}` : ''}`,
    '',
  ];
  if (!books.length) lines.push('ยังไม่มีสมุดที่เปิดใช้งาน');
  for (const b of books) {
    const t = BOOK_TYPES[b.type];
    lines.push(`📒 <b>${esc(b.name)}</b>`);
    lines.push(`   เลขล่าสุด: <b>${b.last_no >= b.start_no ? b.last_no : '—'}</b>   ถัดไป: <b>${b.nextNo}</b>${b.type === 'send' && b.prefix ? ` (${esc(b.prefix)}${b.nextNo})` : ''}`);
    if (b.last?.entry_date) lines.push(`   บันทึกล่าสุด: ${esc(thaiDate(b.last.entry_date, { short: true }))}`);
    if (!b.name.includes(t.label)) lines.push(`   <i>${esc(t.label)}</i>`);
  }
  if (fest) lines.push('', `${fest.emoji} ${fest.ongoing ? `วันนี้${esc(fest.name)}` : `อีก ${fest.daysLeft} วัน ถึง${esc(fest.name)}`}`);
  const url = baseUrl();
  const buttons = [];
  let fallback = '';
  if (url) {
    lines.push('', 'ต้องการจองเลขล่าสุด กดปุ่มด้านล่างเพื่อจอง 👇');
    for (const b of books) {
      const link = `${url}/#/reserve/${b.id}`;
      buttons.push({ text: `🔖 จอง${BOOK_TYPES[b.type].short} ${b.nextNo} — ${b.name}`.slice(0, 64), url: link });
      fallback += `\n🔖 <a href="${esc(link)}">จอง${esc(BOOK_TYPES[b.type].short)} — ${esc(b.name)}</a>`;
    }
    if (fallback) fallback = '\n' + fallback;
  }
  return { html: lines.join('\n'), buttons, fallback };
}

export async function sendDaily() {
  const m = buildDailyMessage();
  return sendMessage(m.html, m.buttons, m.fallback);
}

export async function notifyNewMember(user) {
  if (!tgConfigured() || getSetting('notifyNewMember') !== '1') return;
  const url = baseUrl();
  const html = `🆕 <b>มีผู้สมัครสมาชิกใหม่รออนุมัติ</b>\n${esc(user.full_name)}${user.position ? ` (${esc(user.position)})` : ''}\nชื่อผู้ใช้: ${esc(user.username)}`;
  const buttons = url ? [{ text: '✅ ไปหน้าอนุมัติสมาชิก', url: `${url}/#/admin/members` }] : [];
  await sendMessage(html, buttons).catch((e) => console.warn('[telegram]', e.message));
}

export async function notifyUpdate(commits) {
  if (!tgConfigured() || getSetting('notifyUpdate') !== '1') return;
  const html = `🛠 <b>มีอัพเดตระบบใหม่ ${commits.length} รายการ</b> รอผู้ดูแลยืนยันการติดตั้ง\n` +
    commits.slice(0, 8).map((c) => `• ${esc(c.subject)}`).join('\n');
  const url = baseUrl();
  await sendMessage(html, url ? [{ text: '🔐 เปิดหน้าอัพเดต (ผู้ดูแล)', url: `${url}/#/admin/system` }] : []).catch((e) => console.warn('[telegram]', e.message));
}

/** หา chat id จากข้อความล่าสุดที่ส่งถึงบอท (ให้ผู้ดูแลพิมพ์ /start ในกลุ่มก่อน) */
export async function detectChats(token) {
  const updates = await tgCall('getUpdates', { limit: 50, allowed_updates: ['message', 'my_chat_member', 'channel_post'] }, token);
  const map = new Map();
  for (const u of updates) {
    const chat = u.message?.chat || u.my_chat_member?.chat || u.channel_post?.chat;
    if (chat) map.set(chat.id, { id: String(chat.id), title: chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username, type: chat.type });
  }
  return [...map.values()];
}
