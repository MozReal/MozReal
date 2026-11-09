// สร้างโปรเจกต์ Google Apps Script จากซอร์สเดียวกับเวอร์ชัน Node.js
//   node gas/build.mjs  →  gas/dist/{Code.gs, Index.html, appsscript.json}
// - หน้าเว็บ: รวมทุกโมดูลใน public/js เป็นสคริปต์เดียว + CSS แบบ inline
// - ฝั่งเซิร์ฟเวอร์: โมดูลที่ใช้ร่วมกัน (public/js/shared) + gas/server/*.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GAS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(GAS_DIR, '..');
const PUB = path.join(ROOT, 'public');
const OUT = path.join(GAS_DIR, 'dist');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

/** แปลง ES module เป็นฟังก์ชันใน registry (รองรับเฉพาะรูปแบบ import/export ที่โปรเจกต์นี้ใช้) */
function wrapModule(id, file) {
  let src = fs.readFileSync(file, 'utf8');
  const exportsList = [];
  src = src.replace(/^import\s+\*\s+as\s+(\w+)\s+from\s+'([^']+)';?\s*$/gm, (_, name, from) => `const ${name} = __req(${JSON.stringify(modId(file, from))});`);
  src = src.replace(/^import\s+\{([^}]+)\}\s+from\s+'([^']+)';?\s*$/gm, (_, names, from) => {
    const parts = names.split(',').map((s) => s.trim()).filter(Boolean).map((s) => s.replace(/^(\w+)\s+as\s+(\w+)$/, '$1: $2'));
    return `const { ${parts.join(', ')} } = __req(${JSON.stringify(modId(file, from))});`;
  });
  if (/^\s*import\s/m.test(src)) throw new Error(`รูปแบบ import ที่ไม่รองรับใน ${file}`);
  src = src.replace(/^export\s+(async\s+function|function|class|const|let|var)\s+(\w+)/gm, (_, kind, name) => {
    exportsList.push(name);
    return `${kind} ${name}`;
  });
  src = src.replace(/^export\s+\{([^}]+)\};?\s*$/gm, (_, names) => {
    names.split(',').map((s) => s.trim()).filter(Boolean).forEach((n) => exportsList.push(n));
    return '';
  });
  if (/^\s*export\s/m.test(src)) throw new Error(`รูปแบบ export ที่ไม่รองรับใน ${file}`);
  return `__def(${JSON.stringify(id)}, function () {\n${src}\nreturn { ${[...new Set(exportsList)].join(', ')} };\n});\n`;
}
function modId(fromFile, rel) {
  const abs = path.resolve(path.dirname(fromFile), rel);
  return path.relative(path.join(PUB, 'js'), abs).replace(/\\/g, '/').replace(/\.js$/, '');
}
const LOADER = `var __mods = {}, __cache = {};
function __def(id, fn) { __mods[id] = fn; }
function __req(id) { if (!__cache[id]) { if (!__mods[id]) throw new Error('module not found: ' + id); __cache[id] = __mods[id](); } return __cache[id]; }
`;

function bundle(entries) {
  const files = [];
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p);
  });
  walk(path.join(PUB, 'js'));
  const wanted = new Set();
  const visit = (id) => {
    if (wanted.has(id)) return;
    wanted.add(id);
    const file = path.join(PUB, 'js', id + '.js');
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/from\s+'([^']+)'/g)) visit(modId(file, m[1]));
  };
  entries.forEach(visit);
  return LOADER + [...wanted].map((id) => wrapModule(id, path.join(PUB, 'js', id + '.js'))).join('\n');
}

fs.mkdirSync(OUT, { recursive: true });

// ---------- Index.html ----------
const css = fs.readFileSync(path.join(PUB, 'css', 'app.css'), 'utf8');
const clientJs = bundle(['app']) + '\n__req("app");\n';
let html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
html = html
  .replace(/<!doctype html>\s*/i, '<!DOCTYPE html>\n')
  .replace(/\s*<meta name="viewport"[^>]*>/, '')
  .replace(/\s*<link rel="icon"[^>]*>/, '')
  .replace('<link rel="stylesheet" href="/css/app.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="/js/app.js"></script>', () => `<script>\n${clientJs.replace(/<\/script/gi, '<\\/script')}\n</script>`);
fs.writeFileSync(path.join(OUT, 'Index.html'), html);

// ---------- Code.gs ----------
const sharedIds = ['shared/thaidate', 'shared/schema', 'shared/festivals'];
const sharedExports = [];
const sharedSrc = sharedIds.map((id) => {
  const w = wrapModule(id, path.join(PUB, 'js', id + '.js'));
  sharedExports.push(...w.match(/return \{ ([^}]*) \};\n\}\);\n$/)[1].split(',').map((s) => s.trim()).filter(Boolean));
  return w;
}).join('\n');
const serverFiles = fs.readdirSync(path.join(GAS_DIR, 'server')).filter((f) => f.endsWith('.js')).sort();
const header = `/**
 * สมุดคุมเลขสารบรรณ v${pkg.version} — Google Apps Script
 * ไฟล์นี้สร้างอัตโนมัติจาก gas/build.mjs (แก้ไขที่ซอร์สใน public/js และ gas/server แล้ว build ใหม่)
 */
`;
const code = header +
  `var Shared = (function () {\n${LOADER}${sharedSrc}\nreturn Object.assign({}, ${sharedIds.map((i) => `__req(${JSON.stringify(i)})`).join(', ')});\n})();\n` +
  `var { ${[...new Set(sharedExports)].join(', ')} } = Shared;\n\n` +
  serverFiles.map((f) => `// ----- ${f} -----\n` + fs.readFileSync(path.join(GAS_DIR, 'server', f), 'utf8')).join('\n')
    .replace("'__APP_VERSION__'", JSON.stringify(pkg.version));
fs.writeFileSync(path.join(OUT, 'Code.gs'), code);

// ---------- appsscript.json ----------
fs.writeFileSync(path.join(OUT, 'appsscript.json'), JSON.stringify({
  timeZone: 'Asia/Bangkok',
  runtimeVersion: 'V8',
  exceptionLogging: 'STACKDRIVER',
  webapp: { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' },
  oauthScopes: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/script.external_request',
    'https://www.googleapis.com/auth/script.scriptapp',
    'https://www.googleapis.com/auth/script.deployments',
    'https://www.googleapis.com/auth/script.projects.readonly',
  ],
}, null, 2) + '\n');

console.log(`สร้างไฟล์ที่ ${path.relative(ROOT, OUT)}: Index.html ${(html.length / 1024).toFixed(0)} KB, Code.gs ${(code.length / 1024).toFixed(0)} KB`);
