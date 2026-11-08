// ระบบอัพเดต: ดึงข้อมูลเวอร์ชันใหม่จาก git มารอ แล้วติดตั้งเมื่อผู้ดูแลสั่งเท่านั้น
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, DATA_DIR, backupTo, getSetting, setSetting } from './db.js';

export const RESTART_CODE = 75;
const pkg = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

function git(args, timeout = 60000) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: ROOT, timeout, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message).trim()));
      resolve(stdout.trim());
    });
  });
}

const isGitRepo = () => fs.existsSync(path.join(ROOT, '.git'));

async function branch() {
  return getSetting('updateBranch') || (await git(['rev-parse', '--abbrev-ref', 'HEAD']));
}

export async function status() {
  const info = { version: pkg().version, git: isGitRepo(), commit: null, branch: null, pending: [], lastCheck: getSetting('updateLastCheck'), dirty: false };
  try { info.pending = JSON.parse(getSetting('updatePending') || '[]'); } catch {}
  if (!info.git) return info;
  try {
    info.commit = await git(['rev-parse', '--short', 'HEAD']);
    info.branch = await branch();
    info.dirty = !!(await git(['status', '--porcelain', '--untracked-files=no']));
  } catch (e) {
    info.error = e.message;
  }
  return info;
}

/** ตรวจสอบอัพเดต (ดาวน์โหลดมารอ แต่ยังไม่ติดตั้ง) */
export async function check() {
  if (!isGitRepo()) throw new Error('โฟลเดอร์ระบบไม่ได้ติดตั้งด้วย git จึงตรวจสอบอัพเดตอัตโนมัติไม่ได้');
  const br = await branch();
  await git(['fetch', '--quiet', 'origin', br], 120000);
  const out = await git(['log', `HEAD..origin/${br}`, '--pretty=format:%h%x1f%s%x1f%an%x1f%aI']);
  const pending = out ? out.split('\n').map((l) => {
    const [hash, subject, author, date] = l.split('\x1f');
    return { hash, subject, author, date };
  }) : [];
  const prev = getSetting('updatePending');
  setSetting('updatePending', JSON.stringify(pending));
  setSetting('updateLastCheck', String(Date.now()));
  return { pending, isNew: pending.length > 0 && prev !== JSON.stringify(pending) };
}

/** ติดตั้งอัพเดต — สำรองฐานข้อมูลก่อน แล้วรีสตาร์ทผ่าน launcher */
export async function apply() {
  const st = await status();
  if (!st.git) throw new Error('ไม่ได้ติดตั้งด้วย git');
  if (st.dirty) throw new Error('มีการแก้ไขไฟล์ระบบในเครื่องนี้ ไม่สามารถอัพเดตอัตโนมัติได้ (ตรวจด้วย git status)');
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
  const backup = backupTo(path.join(DATA_DIR, 'backups', `before-update-${stamp}.sqlite`));
  const br = await branch();
  const before = st.commit;
  await git(['pull', '--ff-only', 'origin', br], 180000);
  const after = await git(['rev-parse', '--short', 'HEAD']);
  setSetting('updatePending', '[]');
  // ไม่มี dependency ภายนอก จึงไม่ต้อง npm install — รีสตาร์ทเพื่อโหลดโค้ดใหม่และรัน migration
  setTimeout(() => process.exit(RESTART_CODE), 800);
  return { before, after, backup: path.basename(backup), restarting: true };
}
