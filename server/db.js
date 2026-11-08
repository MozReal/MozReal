import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
export const DB_FILE = path.join(DATA_DIR, 'saraban.sqlite');

export const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

// migration ตามลำดับ — เพิ่มรายการใหม่ต่อท้ายเท่านั้น (ใช้กับระบบอัพเดต)
const MIGRATIONS = [
  `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
   CREATE TABLE users (
     id INTEGER PRIMARY KEY,
     username TEXT NOT NULL UNIQUE COLLATE NOCASE,
     pass TEXT NOT NULL,
     full_name TEXT NOT NULL,
     position TEXT, department TEXT, phone TEXT,
     status TEXT NOT NULL DEFAULT 'pending',
     prefs TEXT NOT NULL DEFAULT '{}',
     created_at INTEGER, approved_at INTEGER, last_login INTEGER
   );
   CREATE TABLE sessions (
     token TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
     admin_until INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL
   );
   CREATE TABLE books (
     id INTEGER PRIMARY KEY,
     type TEXT NOT NULL CHECK (type IN ('receive','send','petition')),
     name TEXT NOT NULL, year INTEGER NOT NULL,
     prefix TEXT NOT NULL DEFAULT '',
     start_no INTEGER NOT NULL DEFAULT 1,
     last_no INTEGER NOT NULL DEFAULT 0,
     color TEXT, status TEXT NOT NULL DEFAULT 'open',
     sort INTEGER NOT NULL DEFAULT 0, created_at INTEGER
   );
   CREATE TABLE entries (
     id INTEGER PRIMARY KEY,
     book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
     no INTEGER NOT NULL,
     entry_date TEXT NOT NULL, entry_time TEXT,
     status TEXT NOT NULL CHECK (status IN ('reserved','filled','cancelled')),
     mode TEXT NOT NULL,
     reserved_by INTEGER, reserved_name TEXT,
     doc_ref TEXT, doc_date TEXT, sender TEXT, recipient TEXT, subject TEXT,
     action TEXT, note TEXT, petitioner TEXT, contact TEXT,
     created_by INTEGER, created_at INTEGER, filled_at INTEGER, updated_at INTEGER,
     edit_count INTEGER NOT NULL DEFAULT 0, cancel_reason TEXT,
     UNIQUE (book_id, no)
   );
   CREATE INDEX entries_status ON entries(book_id, status);
   CREATE TABLE entry_logs (
     id INTEGER PRIMARY KEY, entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
     user_id INTEGER, actor TEXT, action TEXT NOT NULL, detail TEXT, at INTEGER NOT NULL
   );
   CREATE TABLE signatures (
     id INTEGER PRIMARY KEY, entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
     user_id INTEGER, name TEXT NOT NULL, position TEXT, image TEXT NOT NULL, signed_at INTEGER NOT NULL
   );`,
];

function migrate() {
  const v = db.prepare('PRAGMA user_version').get().user_version;
  for (let i = v; i < MIGRATIONS.length; i++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[i]);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
}
migrate();

export const SETTING_DEFAULTS = {
  orgName: '',
  adminPin: '',
  tgToken: '',
  tgChatId: '',
  baseUrl: '',
  notifyEnabled: '1',
  notifyTime: '08:30',
  notifyNewMember: '1',
  notifyUpdate: '1',
  holidays: '',
  festivalAuto: '1',
  festivalForce: '',
  lastDaily: '',
  lastDailyResult: '',
  updateBranch: '',
  updateLastCheck: '',
  updatePending: '[]',
};

export function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : (SETTING_DEFAULTS[key] ?? '');
}
export function setSetting(key, value) {
  db.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value ?? ''));
}

export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function backupTo(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) fs.unlinkSync(file);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  return file;
}
