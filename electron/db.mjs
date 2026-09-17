import { DatabaseSync } from 'node:sqlite';
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULTS = {
  focusMinutes: '50',
  breakMinutes: '5',
  maxPostpones: '3',
  postponeOptions: '5,10,15',
  activities: 'toilet,eyes,water,stretch,walk,breathe,neck,eyes20,stand,face',
  strictMode: 'false',
  soundEnabled: 'true',
  workStart: '09:00',
  workEnd: '18:00',
  workEnabled: 'true',
  weekdaysOnly: 'true',
  quietHoursStart: '11:30',
  quietHoursEnd: '13:30',
  quietHoursEnabled: 'true',
  autostartFocus: 'true',
  alwaysOnTop: 'false',
  theme: 'system',
};

let db;

export function getDbPath() {
  const userData = app.getPath('userData');
  fs.mkdirSync(userData, { recursive: true });
  return path.join(userData, 'take-five.db');
}

export function openDb() {
  if (db) return db;
  db = new DatabaseSync(getDbPath());
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS focus_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      planned_minutes INTEGER NOT NULL,
      actual_seconds INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active'
    );
    CREATE TABLE IF NOT EXISTS break_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scheduled_at TEXT NOT NULL,
      prompted_at TEXT,
      resolved_at TEXT,
      action TEXT NOT NULL,
      activity TEXT,
      postpone_minutes INTEGER,
      duration_seconds INTEGER,
      postpone_count INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      completed_activities TEXT
    );
  `);
  // migration for older DBs
  try {
    db.exec(`ALTER TABLE break_events ADD COLUMN completed_activities TEXT`);
  } catch {
    /* already exists */
  }
  seedSettings();
  // migrate old quiet hours default 12:00 → lunch 11:30 only if still default
  const row = db
    .prepare(`SELECT value FROM settings WHERE key = 'quietHoursStart'`)
    .get();
  if (row?.value === '12:00') {
    db.prepare(`UPDATE settings SET value = '11:30' WHERE key = 'quietHoursStart'`).run();
  }
  return db;
}

function seedSettings() {
  for (const [key, value] of Object.entries(DEFAULTS)) {
    db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO NOTHING`
    ).run(key, value);
  }
}

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const raw = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const theme = ['light', 'dark', 'system'].includes(raw.theme)
    ? raw.theme
    : 'system';
  return {
    focusMinutes: Number(raw.focusMinutes) || 50,
    breakMinutes: Number(raw.breakMinutes) || 5,
    maxPostpones: Number(raw.maxPostpones) || 3,
    postponeOptions: (raw.postponeOptions || '5,10,15')
      .split(',')
      .map((n) => Number(n.trim()))
      .filter(Boolean),
    activities: (raw.activities || DEFAULTS.activities)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    strictMode: raw.strictMode === 'true',
    soundEnabled: raw.soundEnabled === 'true',
    workStart: raw.workStart || '09:00',
    workEnd: raw.workEnd || '18:00',
    workEnabled: raw.workEnabled !== 'false',
    weekdaysOnly: raw.weekdaysOnly !== 'false',
    quietHoursStart: raw.quietHoursStart || '11:30',
    quietHoursEnd: raw.quietHoursEnd || '13:30',
    quietHoursEnabled: raw.quietHoursEnabled === 'true',
    autostartFocus: raw.autostartFocus !== 'false',
    alwaysOnTop: raw.alwaysOnTop === 'true',
    theme,
  };
}

export function setSettings(patch) {
  const stmt = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
  for (const [key, value] of Object.entries(patch)) {
    stmt.run(key, String(value));
  }
  return getSettings();
}

function parseHm(hm, fallback = [0, 0]) {
  if (!hm || typeof hm !== 'string') return fallback;
  const [h, m] = hm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return fallback;
  return [h, m];
}

function minutesNow(d = new Date()) {
  return d.getHours() * 60 + d.getMinutes();
}

function rangeContains(startHm, endHm, now = new Date()) {
  const [sh, sm] = parseHm(startHm);
  const [eh, em] = parseHm(endHm);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  const mins = minutesNow(now);
  if (start <= end) return mins >= start && mins < end;
  return mins >= start || mins < end;
}

export function isInQuietHours(settings = getSettings(), now = new Date()) {
  if (!settings.quietHoursEnabled) return false;
  return rangeContains(settings.quietHoursStart, settings.quietHoursEnd, now);
}

export function isWeekday(now = new Date()) {
  const d = now.getDay();
  return d >= 1 && d <= 5;
}

export function isInWorkHours(settings = getSettings(), now = new Date()) {
  if (!settings.workEnabled) return true;
  if (settings.weekdaysOnly && !isWeekday(now)) return false;
  return rangeContains(settings.workStart, settings.workEnd, now);
}

export function insertFocusSession({ startedAt, plannedMinutes }) {
  const result = db
    .prepare(
      `INSERT INTO focus_sessions (started_at, planned_minutes, status)
       VALUES (?, ?, 'active')`
    )
    .run(startedAt, plannedMinutes);
  return Number(result.lastInsertRowid);
}

export function updateFocusSession(id, { endedAt, actualSeconds, status }) {
  db.prepare(
    `UPDATE focus_sessions
     SET ended_at = ?, actual_seconds = ?, status = ?
     WHERE id = ?`
  ).run(endedAt, actualSeconds, status, id);
}

export function insertBreakEvent(event) {
  const result = db
    .prepare(
      `INSERT INTO break_events
       (scheduled_at, prompted_at, resolved_at, action, activity, postpone_minutes, duration_seconds, postpone_count, note, completed_activities)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      event.scheduledAt ?? null,
      event.promptedAt ?? null,
      event.resolvedAt ?? null,
      event.action,
      event.activity ?? null,
      event.postponeMinutes ?? null,
      event.durationSeconds ?? null,
      event.postponeCount ?? 0,
      event.note ?? null,
      event.completedActivities
        ? JSON.stringify(event.completedActivities)
        : null
    );
  return Number(result.lastInsertRowid);
}

export function updateBreakEvent(id, patch) {
  const fields = [];
  const values = [];
  const map = {
    scheduledAt: 'scheduled_at',
    promptedAt: 'prompted_at',
    resolvedAt: 'resolved_at',
    action: 'action',
    activity: 'activity',
    postponeMinutes: 'postpone_minutes',
    durationSeconds: 'duration_seconds',
    postponeCount: 'postpone_count',
    note: 'note',
    completedActivities: 'completed_activities',
  };
  for (const [k, col] of Object.entries(map)) {
    if (k in patch) {
      fields.push(`${col} = ?`);
      values.push(
        k === 'completedActivities' && patch[k]
          ? JSON.stringify(patch[k])
          : (patch[k] ?? null)
      );
    }
  }
  if (!fields.length) return;
  values.push(id);
  db.prepare(`UPDATE break_events SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

function parseCompleted(raw) {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function listBreakEvents(limit = 100) {
  return db
    .prepare(
      `SELECT id, scheduled_at as scheduledAt, prompted_at as promptedAt,
              resolved_at as resolvedAt, action, activity,
              postpone_minutes as postponeMinutes, duration_seconds as durationSeconds,
              postpone_count as postponeCount, note,
              completed_activities as completedActivities
       FROM break_events
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(limit)
    .map((row) => ({
      ...row,
      completedActivities: parseCompleted(row.completedActivities),
    }));
}

export function getTodayStats() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const iso = start.toISOString();
  const row = db
    .prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN action = 'completed' THEN 1 ELSE 0 END) as completed,
         SUM(CASE WHEN action = 'postponed' THEN 1 ELSE 0 END) as postponed,
         SUM(CASE WHEN action = 'skipped' THEN 1 ELSE 0 END) as skipped,
         SUM(COALESCE(duration_seconds, 0)) as breakSeconds
       FROM break_events
       WHERE scheduled_at >= ? OR resolved_at >= ?`
    )
    .get(iso, iso);

  // streak: consecutive days (ending today or yesterday) with ≥1 completed break
  let streak = 0;
  for (let i = 0; i < 60; i++) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const next = new Date(d);
    next.setDate(d.getDate() + 1);
    const day = db
      .prepare(
        `SELECT SUM(CASE WHEN action = 'completed' THEN 1 ELSE 0 END) as c
         FROM break_events
         WHERE COALESCE(resolved_at, scheduled_at) >= ?
           AND COALESCE(resolved_at, scheduled_at) < ?`
      )
      .get(d.toISOString(), next.toISOString());
    const c = Number(day?.c || 0);
    if (c > 0) streak += 1;
    else if (i > 0) break;
    else if (i === 0 && c === 0) {
      // today not done yet — streak can continue from yesterday
      continue;
    }
  }

  return {
    total: Number(row?.total || 0),
    completed: Number(row?.completed || 0),
    postponed: Number(row?.postponed || 0),
    skipped: Number(row?.skipped || 0),
    breakSeconds: Number(row?.breakSeconds || 0),
    streak,
  };
}

export function getWeekStats() {
  const days = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const next = new Date(d);
    next.setDate(d.getDate() + 1);
    const row = db
      .prepare(
        `SELECT
           SUM(CASE WHEN action = 'completed' THEN 1 ELSE 0 END) as completed,
           SUM(CASE WHEN action = 'postponed' THEN 1 ELSE 0 END) as postponed,
           SUM(CASE WHEN action = 'skipped' THEN 1 ELSE 0 END) as skipped
         FROM break_events
         WHERE COALESCE(resolved_at, scheduled_at) >= ?
           AND COALESCE(resolved_at, scheduled_at) < ?`
      )
      .get(d.toISOString(), next.toISOString());
    days.push({
      date: d.toISOString().slice(0, 10),
      completed: Number(row?.completed || 0),
      postponed: Number(row?.postponed || 0),
      skipped: Number(row?.skipped || 0),
    });
  }
  return days;
}
