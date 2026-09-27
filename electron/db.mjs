import { DatabaseSync } from 'node:sqlite';
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULTS = {
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
  autostartFocus: 'false',
  alwaysOnTop: 'false',
  theme: 'system',
};

let db;
let settingsCache = null;

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
    CREATE INDEX IF NOT EXISTS idx_break_events_scheduled_at
      ON break_events(scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_break_events_resolved_at
      ON break_events(resolved_at);
    CREATE INDEX IF NOT EXISTS idx_focus_sessions_started_at
      ON focus_sessions(started_at);
  `);
  // migration for older DBs
  try {
    db.exec(`ALTER TABLE break_events ADD COLUMN completed_activities TEXT`);
  } catch {
    /* already exists */
  }
  seedSettings();
  return db;
}

export function closeDb() {
  settingsCache = null;
  if (db) {
    try {
      db.close();
    } catch {
      /* already closed */
    }
    db = undefined;
  }
}

function seedSettings() {
  const stmt = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO NOTHING`
  );
  for (const [key, value] of Object.entries(DEFAULTS)) {
    stmt.run(key, value);
  }
}

export function getSettings() {
  if (settingsCache) return settingsCache;
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const raw = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const theme = ['light', 'dark', 'system'].includes(raw.theme)
    ? raw.theme
    : 'system';
  // 缓存并冻结：getSettings 在 250ms tick 热路径上，调用方一律只读
  settingsCache = Object.freeze({
    focusMinutes: Number(raw.focusMinutes) || 50,
    breakMinutes: Number(raw.breakMinutes) || 5,
    maxPostpones: Number(raw.maxPostpones) || 3,
    postponeOptions: Object.freeze(
      (raw.postponeOptions || '5,10,15')
        .split(',')
        .map((n) => Number(n.trim()))
        .filter(Boolean)
    ),
    activities: Object.freeze(
      (raw.activities || DEFAULTS.activities)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    ),
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
  });
  return settingsCache;
}

export function setSettings(patch) {
  const entries = Object.entries(patch || {});
  if (entries.length) {
    const stmt = db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    );
    db.exec('BEGIN');
    try {
      for (const [key, value] of entries) {
        stmt.run(key, String(value));
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  settingsCache = null;
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

/** 当前处于 [startHm, endHm) 区间时，返回距区间结束的分钟数；否则 0。支持跨午夜。 */
export function minutesUntilRangeEnd(startHm, endHm, now = new Date()) {
  const [sh, sm] = parseHm(startHm);
  const [eh, em] = parseHm(endHm);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  const mins = minutesNow(now);
  if (start <= end) {
    return mins >= start && mins < end ? end - mins : 0;
  }
  if (mins >= start) return 24 * 60 - mins + end;
  if (mins < end) return end - mins;
  return 0;
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

function localDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const STATS_LOOKBACK_DAYS = 365;

/**
 * 一次 GROUP BY 查询同时供给今日三格、streak 与周图，
 * 消除此前逐日 N+1（最多 68 条/次轮询）。日期按本地时区归组。
 */
function dailyActionCounts(daysBack) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - daysBack);
  const rows = db
    .prepare(
      `SELECT date(COALESCE(resolved_at, scheduled_at), 'localtime') AS day,
              COUNT(*) AS total,
              SUM(CASE WHEN action = 'completed' THEN 1 ELSE 0 END) AS completed,
              SUM(CASE WHEN action = 'postponed' THEN 1 ELSE 0 END) AS postponed,
              SUM(CASE WHEN action = 'skipped' THEN 1 ELSE 0 END) AS skipped,
              SUM(COALESCE(duration_seconds, 0)) AS breakSeconds
       FROM break_events
       WHERE COALESCE(resolved_at, scheduled_at) >= ?
       GROUP BY day`
    )
    .all(start.toISOString());
  const map = new Map();
  for (const r of rows) map.set(r.day, r);
  return map;
}

export function getTodayStats() {
  const map = dailyActionCounts(STATS_LOOKBACK_DAYS);
  const row = map.get(localDateKey(new Date()));

  // streak：连续（截至今天或昨天）每天 ≥1 次完成；上限即查询回溯窗口
  let streak = 0;
  for (let i = 0; i <= STATS_LOOKBACK_DAYS; i++) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const completed = Number(map.get(localDateKey(d))?.completed || 0);
    if (completed > 0) streak += 1;
    else if (i === 0) continue; // 今天还没完成不打断，从昨天继续数
    else break;
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
  const map = dailyActionCounts(6);
  const days = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const row = map.get(localDateKey(d));
    days.push({
      date: localDateKey(d),
      completed: Number(row?.completed || 0),
      postponed: Number(row?.postponed || 0),
      skipped: Number(row?.skipped || 0),
    });
  }
  return days;
}
