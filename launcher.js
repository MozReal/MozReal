// ตัวเรียกใช้งานเซิร์ฟเวอร์ — รีสตาร์ทอัตโนมัติหลังติดตั้งอัพเดต (exit code 75) หรือเมื่อโปรแกรมล้ม
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const RESTART_CODE = 75;
let crashes = 0;

function start() {
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(ROOT, 'server', 'index.js')], {
    stdio: 'inherit',
    cwd: ROOT,
    env: process.env,
  });
  const startedAt = Date.now();
  child.on('exit', (code, signal) => {
    if (code === RESTART_CODE) {
      console.log('[launcher] รีสตาร์ทเพื่อใช้งานเวอร์ชันใหม่…');
      crashes = 0;
      return start();
    }
    if (code === 0 || signal === 'SIGINT' || signal === 'SIGTERM') return process.exit(0);
    crashes = Date.now() - startedAt < 10_000 ? crashes + 1 : 1;
    if (crashes > 5) {
      console.error('[launcher] เซิร์ฟเวอร์ล้มซ้ำหลายครั้ง หยุดการรีสตาร์ท');
      return process.exit(1);
    }
    console.error(`[launcher] เซิร์ฟเวอร์หยุดทำงาน (code ${code}) จะเริ่มใหม่ใน 3 วินาที`);
    setTimeout(start, 3000);
  });
  for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => child.kill(sig));
}
start();
