// =====================================================================
// Telegram Bot
// =====================================================================
function tgEsc_(s) { return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function tgConfigured() { return !!(getSetting('tgToken') && getSetting('tgChatId')); }

function tgCall(method, payload, token) {
  token = token || getSetting('tgToken');
  if (!token) throw new Error('ยังไม่ได้ตั้งค่า Bot Token');
  var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + method, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(payload || {}), muteHttpExceptions: true,
  });
  var json = {};
  try { json = JSON.parse(res.getContentText()); } catch (e) {}
  if (!json.ok) throw new Error(json.description || ('Telegram ตอบกลับ ' + res.getResponseCode()));
  return json.result;
}

function tgSend(html, buttons, fallbackText) {
  var chatId = getSetting('tgChatId');
  if (!chatId) throw new Error('ยังไม่ได้ตั้งค่า Chat ID');
  var base = { chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true };
  if (buttons && buttons.length) {
    try {
      return tgCall('sendMessage', Object.assign({}, base, { reply_markup: { inline_keyboard: buttons.map(function (b) { return [b]; }) } }));
    } catch (e) {
      if (!/url|button/i.test(e.message)) throw e;
    }
  }
  return tgCall('sendMessage', Object.assign({}, base, { text: html + (fallbackText || '') }));
}

/** ที่อยู่เว็บแอป (Apps Script สร้างให้อัตโนมัติ) */
function appUrl_() {
  var u = (getSetting('baseUrl') || '').replace(/\/+$/, '');
  if (u) return u;
  try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; }
}
function appLink_(page) {
  var u = appUrl_();
  if (!u) return '';
  return u + (u.indexOf('?') >= 0 ? '&' : '?') + 'p=' + encodeURIComponent(page).replace(/%2F/g, '/');
}

function buildDailyMessage() {
  var now = bkkNow();
  var org = getSetting('orgName');
  var books = table_('Books').filter(function (b) { return b.status === 'open'; })
    .sort(function (a, b) { return a.sort - b.sort || a.id - b.id; }).map(bookSummary);
  var fest = activeFestival(now.date);
  var lines = ['☀️ <b>อรุณสวัสดิ์ — สรุปเลขทะเบียนประจำวัน</b>', tgEsc_(thaiDate(now.date, { day: true })) + (org ? '\n🏛 ' + tgEsc_(org) : ''), ''];
  if (!books.length) lines.push('ยังไม่มีสมุดที่เปิดใช้งาน');
  books.forEach(function (b) {
    var t = BOOK_TYPES[b.type];
    lines.push('📒 <b>' + tgEsc_(b.name) + '</b>');
    lines.push('   เลขล่าสุด: <b>' + (b.last_no >= b.start_no ? b.last_no : '—') + '</b>   ถัดไป: <b>' + b.nextNo + '</b>' + (b.type === 'send' && b.prefix ? ' (' + tgEsc_(b.prefix) + b.nextNo + ')' : ''));
    if (b.last && b.last.entry_date) lines.push('   บันทึกล่าสุด: ' + tgEsc_(thaiDate(b.last.entry_date, { short: true })));
    if (b.name.indexOf(t.label) < 0) lines.push('   <i>' + tgEsc_(t.label) + '</i>');
  });
  if (fest) lines.push('', fest.emoji + ' ' + (fest.ongoing ? 'วันนี้' + tgEsc_(fest.name) : 'อีก ' + fest.daysLeft + ' วัน ถึง' + tgEsc_(fest.name)));
  var buttons = [], fallback = '';
  if (appUrl_()) {
    lines.push('', 'ต้องการจองเลขล่าสุด กดปุ่มด้านล่างเพื่อจอง 👇');
    books.forEach(function (b) {
      var link = appLink_('reserve/' + b.id);
      buttons.push({ text: ('🔖 จอง' + BOOK_TYPES[b.type].short + ' ' + b.nextNo + ' — ' + b.name).slice(0, 64), url: link });
      fallback += '\n🔖 <a href="' + tgEsc_(link) + '">จอง' + tgEsc_(BOOK_TYPES[b.type].short) + ' — ' + tgEsc_(b.name) + '</a>';
    });
    if (fallback) fallback = '\n' + fallback;
  }
  return { html: lines.join('\n'), buttons: buttons, fallback: fallback };
}

function sendDaily() {
  var m = buildDailyMessage();
  return tgSend(m.html, m.buttons, m.fallback);
}

function notifyNewMember(u) {
  if (!tgConfigured() || getSetting('notifyNewMember') !== '1') return;
  try {
    var link = appLink_('admin/members');
    tgSend('🆕 <b>มีผู้สมัครสมาชิกใหม่รออนุมัติ</b>\n' + tgEsc_(u.full_name) + (u.position ? ' (' + tgEsc_(u.position) + ')' : '') + '\nชื่อผู้ใช้: ' + tgEsc_(u.username),
      link ? [{ text: '✅ ไปหน้าอนุมัติสมาชิก', url: link }] : []);
  } catch (e) { console.warn('notifyNewMember', e); }
}

function notifyUpdate(pending) {
  if (!tgConfigured() || getSetting('notifyUpdate') !== '1') return;
  try {
    var link = appLink_('admin/system');
    tgSend('🛠 <b>มีอัพเดตระบบใหม่ ' + pending.length + ' รายการ</b> รอผู้ดูแลยืนยันการติดตั้ง\n' + pending.slice(0, 8).map(function (c) { return '• ' + tgEsc_(c.subject); }).join('\n'),
      link ? [{ text: '🔐 เปิดหน้าอัพเดต (ผู้ดูแล)', url: link }] : []);
  } catch (e) { console.warn('notifyUpdate', e); }
}

function detectChats(token) {
  var updates = tgCall('getUpdates', { limit: 50 }, token);
  var map = {};
  updates.forEach(function (u) {
    var c = (u.message && u.message.chat) || (u.my_chat_member && u.my_chat_member.chat) || (u.channel_post && u.channel_post.chat);
    if (c) map[c.id] = { id: String(c.id), title: c.title || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.username, type: c.type };
  });
  return Object.keys(map).map(function (k) { return map[k]; });
}
