// ตัวจำลองบริการของ Google Apps Script สำหรับทดสอบ gas/dist/Code.gs บนเครื่อง (ไม่ได้ใช้งานจริง)
//   node gas/test/gas-mock.cjs [port]  → เปิดเว็บแอปจำลองที่ http://localhost:<port>
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const http = require('http');

function makeServices() {
  const props = {};
  const cache = {};
  const triggers = [];
  const sent = [];
  class Range {
    constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
    getValues() { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(this.sh.get(this.r + i, this.c + j)); out.push(row); } return out; }
    setValues(v) { v.forEach((row, i) => row.forEach((x, j) => this.sh.set(this.r + i, this.c + j, x))); return this; }
    setValue(x) { this.sh.set(this.r, this.c, x); return this; }
    setFontWeight() { return this; } setBackground() { return this; } setNumberFormat() { return this; }
  }
  class Sheet {
    constructor(name) { this.name = name; this.cells = []; this.maxRows = 1000; }
    get(r, c) { return (this.cells[r - 1] || [])[c - 1] ?? ''; }
    set(r, c, v) { while (this.cells.length < r) this.cells.push([]); this.cells[r - 1][c - 1] = v; }
    getName() { return this.name; }
    getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
    getLastRow() { for (let i = this.cells.length; i > 0; i--) if ((this.cells[i - 1] || []).some((x) => x !== '' && x != null)) return i; return 0; }
    getLastColumn() { return Math.max(0, ...this.cells.map((r) => r.length)); }
    getMaxRows() { return this.maxRows; }
    insertRowsAfter(_, n) { this.maxRows += n; }
    deleteRow(r) { this.cells.splice(r - 1, 1); }
    setFrozenRows() {} hideSheet() {}
  }
  const book = {
    sheets: [new Sheet('Sheet1')],
    getId: () => 'SHEET_ID', getName: () => 'mock db', getUrl: () => 'https://docs.google.com/spreadsheets/d/SHEET_ID',
    getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; },
    insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; },
    getSheets() { return this.sheets; },
    deleteSheet(s) { this.sheets = this.sheets.filter((x) => x !== s); },
    copy: () => ({ getUrl: () => 'https://docs.google.com/spreadsheets/d/COPY' }),
  };
  const triggerBuilder = (handler) => {
    const t = { handler };
    const b = {
      timeBased: () => b, everyDays: () => b, atHour: (h) => { t.hour = h; return b; }, inTimezone: () => b,
      at: (d) => { t.at = d; return b; }, after: (ms) => { t.at = new Date(Date.now() + ms); return b; },
      create: () => { const tr = { ...t, getHandlerFunction: () => handler }; triggers.push(tr); return tr; },
    };
    return b;
  };
  return {
    state: { props, triggers, sent, book },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache[k] ?? null, put: (k, v) => { cache[k] = v; }, remove: (k) => { delete cache[k]; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => book, openById: () => book, create: () => book, flush: () => {} },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, s) => [...crypto.createHash('sha256').update(String(s), 'utf8').digest()].map((b) => (b > 127 ? b - 256 : b)),
      base64Encode: (bytes) => Buffer.from(bytes.map((b) => (b + 256) % 256)).toString('base64'),
      getUuid: () => crypto.randomUUID(),
      formatDate: (d, tz, f) => { const t = new Date(d.getTime() + 7 * 3600e3).toISOString(); return f.replace('yyyy', t.slice(0, 4)).replace('MM', t.slice(5, 7)).replace('dd', t.slice(8, 10)).replace('HH', t.slice(11, 13)).replace('mm', t.slice(14, 16)); },
    },
    ScriptApp: {
      getProjectTriggers: () => [...triggers], deleteTrigger: (t) => triggers.splice(triggers.indexOf(t), 1),
      newTrigger: triggerBuilder, getScriptId: () => 'SCRIPT_ID', getOAuthToken: () => 'TOKEN',
      getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/DEPLOY_ID/exec' }),
    },
    UrlFetchApp: {
      fetch: (url, opt) => {
        sent.push({ url, payload: opt && opt.payload });
        let body = { ok: true, result: { message_id: 1, username: 'mock_bot' } };
        if (url.includes('script.googleapis.com')) {
          if (url.endsWith('/deployments/DEPLOY_ID')) body = { deploymentConfig: { versionNumber: 3, description: 'prod' } };
          else if (url.includes('/versions')) body = { versions: [{ versionNumber: 3 }, { versionNumber: 4, description: 'ปรับหน้าพิมพ์', createTime: '2026-11-09T01:00:00Z' }] };
        }
        return { getContentText: () => JSON.stringify(body), getResponseCode: () => 200 };
      },
    },
    HtmlService: { createHtmlOutputFromFile: () => ({}), XFrameOptionsMode: {} },
  };
}

function load(codeFile) {
  const svc = makeServices();
  const ctx = vm.createContext({ console, ...svc });
  vm.runInContext(fs.readFileSync(codeFile, 'utf8'), ctx, { filename: 'Code.gs' });
  return { ctx, state: svc.state };
}
module.exports = { load };

if (require.main === module) {
  const dist = path.join(__dirname, '..', 'dist');
  const { ctx } = load(path.join(dist, 'Code.gs'));
  const port = +process.argv[2] || 3222;
  const bridge = `<script>window.google = { script: {
    url: { getLocation: (cb) => cb({ parameter: Object.fromEntries(new URLSearchParams(location.search)) }) },
    get run() { let ok, bad; const r = { withSuccessHandler(f) { ok = f; return r; }, withFailureHandler(f) { bad = f; return r; },
      api(...args) { fetch('/__gas', { method: 'POST', body: JSON.stringify(args) }).then((x) => x.json()).then(ok, bad); } }; return r; } } };</script>`;
  http.createServer((req, res) => {
    if (req.url === '/__gas') {
      let b = '';
      req.on('data', (c) => (b += c));
      req.on('end', () => setTimeout(() => { const out = ctx.api(...JSON.parse(b)); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(out)); }, +process.env.GAS_MOCK_DELAY || 0));
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(path.join(dist, 'Index.html'), 'utf8').replace('<head>', '<head>' + bridge));
  }).listen(port, () => console.log('GAS mock on http://localhost:' + port));
}
