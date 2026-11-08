// ทดสอบตรรกะหลัก: ธีมเทศกาล, เวลาไทย, การออกเลข/จองเลข, เงื่อนไขแจ้งเตือน
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-test-'));

const { activeFestival } = await import('../public/js/shared/festivals.js');
const { bkkNow, thaiDate } = await import('../public/js/shared/thaidate.js');
const { db, setSetting } = await import('../server/db.js');
const ledger = await import('../server/ledger.js');
const { shouldSendDaily } = await import('../server/scheduler.js');

test('ธีมเทศกาล: เริ่มก่อน 7 วัน และกลับเมื่อจบวัน', () => {
  assert.equal(activeFestival('2026-11-16'), null);
  assert.equal(activeFestival('2026-11-17').id, 'loykrathong');
  assert.equal(activeFestival('2026-11-24').id, 'loykrathong');
  assert.equal(activeFestival('2026-11-25'), null);
  assert.equal(activeFestival('2026-04-15').id, 'songkran');
  assert.equal(activeFestival('2026-04-16'), null);
});

test('ธีมเทศกาล: ช่วงทับกัน เลือกเทศกาลที่ถึงวันแล้วก่อน', () => {
  assert.equal(activeFestival('2026-12-25').id, 'christmas');
  assert.equal(activeFestival('2026-12-26').id, 'newyear');
  assert.equal(activeFestival('2027-01-01').id, 'newyear');
  assert.equal(activeFestival('2026-02-12').id, 'valentine');
  assert.equal(activeFestival('2026-02-16').id, 'chinese');
});

test('เวลาไทย', () => {
  const n = bkkNow(new Date('2026-11-09T01:30:00Z'));
  assert.deepEqual([n.date, n.time, n.dow], ['2026-11-09', '08:30', 1]);
  assert.equal(thaiDate('2026-11-09'), '9 พฤศจิกายน 2569');
});

function user(name) {
  const r = db.prepare("INSERT INTO users(username, pass, full_name, status) VALUES (?, 'x:y', ?, 'active')").run(name, name);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid);
}

test('แยกเล่มแยกเลข + จองเลข + กรอกภายหลังไม่นับเป็นการแก้ไข', () => {
  const a = user('a'), b = user('b');
  const rec = db.prepare("INSERT INTO books(type, name, year) VALUES ('receive', 'รับ', 2569)").run().lastInsertRowid;
  const snd = db.prepare("INSERT INTO books(type, name, year, prefix, start_no) VALUES ('send', 'ส่ง', 2569, 'ศธ 0001/', 50)").run().lastInsertRowid;

  const e1 = ledger.issueNow(rec, a, { subject: 'ก' });
  const [r2, r3] = ledger.reserve(rec, b, { count: 2 });
  const e4 = ledger.issueNow(rec, a, { subject: 'ง' });
  assert.deepEqual([e1.no, r2.no, r3.no, e4.no], [1, 2, 3, 4]);
  assert.equal(r2.status, 'reserved');

  const s1 = ledger.issueNow(snd, a, { subject: 'ส่ง' });
  assert.equal(s1.no, 50);
  assert.equal(s1.doc_ref, 'ศธ 0001/50');

  const filled = ledger.updateEntry(r2.id, b, false, { subject: 'กรอกทีหลัง' });
  assert.equal(filled.status, 'filled');
  assert.equal(filled.edit_count, 0);
  assert.equal(filled.entry_date, r2.entry_date);
  const edited = ledger.updateEntry(r2.id, b, false, { subject: 'แก้ไข' });
  assert.equal(edited.edit_count, 1);

  assert.throws(() => ledger.updateEntry(r3.id, a, false, { subject: 'x' }), /เฉพาะผู้ออกเลข/);
  assert.throws(() => ledger.cancelEntry(e1.id, a, false, 'x'), /ผู้ดูแลระบบเท่านั้น/);
  assert.equal(ledger.cancelEntry(r3.id, b, false, 'ไม่ใช้').status, 'cancelled');
  assert.equal(ledger.issueNow(rec, a, { subject: 'จ' }).no, 5); // เลขที่ยกเลิกไม่นำกลับมาใช้
});

test('แจ้งเตือน: เฉพาะจันทร์–ศุกร์ หลังเวลาที่ตั้ง ไม่ซ้ำ และข้ามวันหยุด', () => {
  setSetting('tgToken', '1:abc'); setSetting('tgChatId', '-1');
  const at = (date, time, dow) => shouldSendDaily({ date, time, dow });
  assert.equal(at('2026-11-09', '08:29', 1), false);
  assert.equal(at('2026-11-09', '08:30', 1), true);
  assert.equal(at('2026-11-08', '08:30', 0), false); // อาทิตย์
  assert.equal(at('2026-11-14', '08:30', 6), false); // เสาร์
  assert.equal(at('2026-11-09', '13:00', 1), false); // เลยช่วงส่งย้อน
  setSetting('holidays', '2026-11-10');
  assert.equal(at('2026-11-10', '08:31', 2), false);
  setSetting('lastDaily', '2026-11-11');
  assert.equal(at('2026-11-11', '09:00', 3), false);
});
