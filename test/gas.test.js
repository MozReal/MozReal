// ทดสอบโค้ด Google Apps Script (gas/dist/Code.gs) ผ่านตัวจำลองบริการของ Google
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

execFileSync(process.execPath, ['gas/build.mjs']);
const { load } = createRequire(import.meta.url)('../gas/test/gas-mock.cjs');
const { ctx, state } = load('gas/dist/Code.gs');

let tokenA = '', tokenU = '';
const call = (method, path, body, token) => {
  const r = ctx.api(method, path, body, token);
  return JSON.parse(JSON.stringify(r));
};
const ok = (r) => { assert.ok(!r.__error, r.__error); return r; };

test('GAS: ตั้งค่าครั้งแรก + สมัคร + อนุมัติด้วย PIN', () => {
  assert.equal(call('GET', '/api/bootstrap').setupDone, false);
  tokenA = ok(call('POST', '/api/setup', { orgName: 'อบต.ทดสอบ', pin: '123456', pin2: '123456' })).__token;
  assert.ok(tokenA);
  assert.ok(state.triggers.some((t) => t.handler === 'dailyPlanner'));
  ok(call('POST', '/api/register', { username: 'somchai', password: 'secret1', fullName: 'สมชาย ใจดี' }));
  assert.match(call('POST', '/api/login', { username: 'somchai', password: 'secret1' }).__error, /รอผู้ดูแล/);
  assert.match(call('POST', '/api/admin/unlock', { pin: '000000' }).__error, /PIN ไม่ถูกต้อง/);
  ok(call('POST', '/api/admin/users/1/approve', {}, tokenA));
  tokenU = ok(call('POST', '/api/login', { username: 'somchai', password: 'secret1' })).__token;
  assert.equal(call('GET', '/api/bootstrap', null, tokenU).user.fullName, 'สมชาย ใจดี');
});

test('GAS: ออกเลข จองเลข กรอกภายหลัง แก้ไข ยกเลิก เซ็นรับ', () => {
  ok(call('PUT', '/api/admin/books/2', { prefix: 'ปท 72403/', start_no: 1235 }, tokenA));
  const sent = ok(call('POST', '/api/books/2/issue', { sender: 'อบต.', subject: 'ตรวจสอบภาษีอาคาร', action: 'กองช่าง', recipients: ['บริษัท ก', 'บริษัท ข'] }, tokenU));
  assert.deepEqual(sent.map((e) => e.doc_ref), ['ปท 72403/1235', 'ปท 72403/1236']);
  const r1 = ok(call('POST', '/api/books/1/issue', { subject: 'หนังสือเชิญ' }, tokenU));
  const res = ok(call('POST', '/api/books/1/reserve', { count: 2 }, tokenU));
  assert.deepEqual([r1.no, ...res.map((e) => e.no)], [1, 2, 3]);
  assert.equal(ok(call('GET', '/api/badges', null, tokenU)).mine, 2);
  const filled = ok(call('PUT', `/api/entries/${res[0].id}`, { subject: 'กรอกทีหลัง' }, tokenU));
  assert.equal(filled.edit_count, 0);
  assert.equal(ok(call('PUT', `/api/entries/${res[0].id}`, { subject: 'แก้ไข' }, tokenU)).edit_count, 1);
  assert.equal(ok(call('POST', `/api/entries/${res[1].id}/cancel`, { reason: 'ไม่ใช้' }, tokenU)).status, 'cancelled');
  const img = 'data:image/png;base64,' + 'A'.repeat(100000);
  ok(call('POST', `/api/entries/${r1.id}/sign`, { name: 'ครูเอ', image: img }, tokenU));
  const d = ok(call('GET', `/api/entries/${r1.id}`, null, tokenU));
  assert.equal(d.signatures[0].image, img); // ลายเซ็นยาวเกิน 1 ช่องของชีต ต้องต่อกลับได้ครบ
  assert.deepEqual(d.logs.map((l) => l.action), ['issue', 'sign']);
  const list = ok(call('GET', '/api/books/1/entries?q=' + encodeURIComponent('แก้ไข'), null, tokenU));
  assert.equal(list.total, 1);
  const csv = ok(call('GET', '/api/books/2/export.csv', null, tokenU));
  assert.match(csv.text, /ปท 72403\/1236/);
});

test('GAS: Telegram + ตัวตั้งเวลา + อัพเดต + ภาพรวมผู้ดูแล', () => {
  ok(call('PUT', '/api/admin/settings', { tgToken: '1:abc', tgChatId: '-100', notifyTime: '08:30' }, tokenA));
  const m = ok(call('GET', '/api/admin/telegram/preview', null, tokenA));
  assert.match(m.buttons[0].url, /\/exec\?p=reserve\/\d+$/);
  ok(call('POST', '/api/admin/telegram/daily', {}, tokenA));
  assert.ok(state.sent.some((s) => s.url.includes('api.telegram.org')));
  const st = ok(call('POST', '/api/admin/update/check', {}, tokenA));
  assert.equal(st.pending[0].version, 4);
  assert.equal(ok(call('POST', '/api/admin/update/apply', {}, tokenA)).after, 'v4');
  const ov = ok(call('GET', '/api/admin/overview', null, tokenA));
  assert.equal(ov.counts.members, 1);
  assert.ok(ov.activity.length >= 5);
  assert.match(call('GET', '/api/admin/overview', null, tokenU).__error, /PIN/);
});
